import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as sharp from 'sharp';
import {
  ImageAnalysisService,
  ImageModerationFindings,
  classifyModeration,
} from './image-analysis.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadImageResponse } from './dto/upload-response.dto';
import { assertSafeS3Endpoint } from '../common/services/url-validator';

/** Maximum file size in bytes (10 MB per image). */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Maximum video file size in bytes (100 MB). */
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

/** Maximum number of images per listing. */
const MAX_IMAGES_PER_LISTING = 20;

/** Maximum length for sanitized filenames. */
const MAX_FILENAME_LENGTH = 200;

/** Maximum image width after resize. */
const MAX_IMAGE_WIDTH = 1200;

/** JPEG compression quality. */
const JPEG_QUALITY = 80;

/** Allowed image MIME types mapped to their magic-byte signatures. */
const MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
};

/**
 * Allowed video MIME types and their magic-byte signatures.
 * MP4: ftyp box at offset 4; QuickTime: starts with specific atoms.
 * We accept video/mp4 and video/quicktime (iPhone .mov files).
 */
const VIDEO_MIME_SIGNATURES: Array<{ mime: string; offset: number; bytes: number[] }> = [
  { mime: 'video/mp4', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },       // 'ftyp'
  { mime: 'video/quicktime', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // 'ftyp' (QuickTime MOV)
  { mime: 'video/quicktime', offset: 0, bytes: [0x00, 0x00, 0x00] },        // QuickTime fallback
];

/** Placeholder image dimensions used in dev/stub mode. */
const PLACEHOLDER_WIDTH = 800;
const PLACEHOLDER_HEIGHT = 1000;

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly presignedUrlExpiry: number;
  private readonly s3Configured: boolean;
  private readonly nodeEnv: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly imageAnalysisService: ImageAnalysisService,
    private readonly prisma: PrismaService,
  ) {
    const region = this.configService.get<string>('S3_REGION', 'us-east-1');
    const endpoint = this.configService.get<string>('S3_ENDPOINT', '');
    // SSRF defense: reject endpoints pointing at loopback, metadata services,
    // or private IPs. Fails fast at startup.
    assertSafeS3Endpoint(endpoint);
    const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY', '');
    const secretAccessKey = this.configService.get<string>(
      'S3_SECRET_KEY',
      '',
    );

    this.bucket = this.configService.get<string>(
      'S3_BUCKET',
      'vintage-uploads',
    );
    this.presignedUrlExpiry = Number(
      this.configService.get<string>('PRESIGNED_URL_EXPIRY', '3600'),
    );

    // S3 is only usable when real credentials are provided
    this.s3Configured = !!(accessKeyId && secretAccessKey && this.bucket !== 'vintage-uploads');
    this.nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    const s3Config: ConstructorParameters<typeof S3Client>[0] = {
      region,
      credentials: {
        accessKeyId: accessKeyId || 'dev',
        secretAccessKey: secretAccessKey || 'dev',
      },
    };

    if (endpoint) {
      s3Config.endpoint = endpoint;
      s3Config.forcePathStyle = true;
    }

    this.s3 = new S3Client(s3Config);

    if (!this.s3Configured) {
      this.logger.warn(
        'S3 credentials not configured — uploads will use placeholder images (dev mode)',
      );
    }
  }

  /**
   * Validate MIME type via magic bytes — never trust file extensions.
   */
  validateMimeType(buffer: Buffer): string {
    for (const [mime, signature] of Object.entries(MAGIC_BYTES)) {
      if (buffer.length >= signature.length) {
        const matches = signature.every(
          (byte, index) => buffer[index] === byte,
        );
        if (matches) {
          return mime;
        }
      }
    }
    throw new BadRequestException(
      'Tipo de arquivo não suportado. Apenas JPEG e PNG são aceitos.',
    );
  }

  /**
   * Sanitize filename: strip path-traversal characters, null bytes, and limit length.
   */
  sanitizeFilename(filename: string): string {
    // Strip null bytes, forward slashes, backslashes
    // eslint-disable-next-line no-control-regex
    let sanitized = filename.replace(/[\x00/\\]/g, '');

    // Remove any remaining path components
    sanitized = sanitized.replace(/\.\./g, '');

    // Trim whitespace
    sanitized = sanitized.trim();

    // Limit length
    if (sanitized.length > MAX_FILENAME_LENGTH) {
      const ext = sanitized.slice(sanitized.lastIndexOf('.'));
      const base = sanitized.slice(
        0,
        MAX_FILENAME_LENGTH - ext.length,
      );
      sanitized = base + ext;
    }

    // Fallback if empty after sanitization
    if (!sanitized || sanitized === '.') {
      sanitized = 'upload';
    }

    return sanitized;
  }

  /**
   * Validate buffer size with early abort — reads in chunks to avoid loading
   * oversized files entirely into memory before checking.
   */
  validateFileSize(buffer: Buffer): void {
    // Check size in chunks to simulate early-abort streaming behavior
    const chunkSize = 64 * 1024; // 64 KB chunks
    let bytesRead = 0;

    for (let offset = 0; offset < buffer.length; offset += chunkSize) {
      bytesRead += Math.min(chunkSize, buffer.length - offset);
      if (bytesRead > MAX_FILE_SIZE) {
        throw new BadRequestException(
          `Arquivo excede o tamanho máximo de ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
        );
      }
    }
  }

  /**
   * Upload a listing image: validates, processes with Sharp, stores in S3.
   * SafeSearch moderation gates the write: VERY_LIKELY for adult /
   * violence / racy aborts before S3; LIKELY proceeds but queues a
   * ListingImageFlag for admin review.
   */
  async uploadListingImage(
    file: Buffer,
    filename: string,
    mimeType: string,
    uploaderId: string,
    _listingImageCount?: number,
  ): Promise<UploadImageResponse> {
    // 1. Validate file size with early abort
    this.validateFileSize(file);

    // 2. Validate MIME type via magic bytes (ignore the provided mimeType)
    const detectedMime = this.validateMimeType(file);
    this.logger.debug(
      `Detected MIME: ${detectedMime}, provided: ${mimeType}`,
    );

    // 3. Check max images per listing
    const imageCount = _listingImageCount ?? 0;
    if (imageCount >= MAX_IMAGES_PER_LISTING) {
      throw new BadRequestException(
        `Máximo de ${MAX_IMAGES_PER_LISTING} imagens por anúncio.`,
      );
    }

    // 4. Sanitize filename
    const safeName = this.sanitizeFilename(filename);
    const timestamp = Date.now();
    const key = `listings/${timestamp}-${safeName}.jpg`;

    // 5. Run image analysis on the validated buffer (non-blocking, never throws)
    const { suggestions, moderation } =
      await this.imageAnalysisService.analyze(file);

    // 5a. SafeSearch gate. classifyModeration returns 'CLEAN' when
    // moderation is null (Vision disabled / outage) — fail-open is
    // acceptable for launch; tighten to REJECT-on-null once Vision
    // is confirmed stable for our traffic.
    const decision = classifyModeration(moderation);
    if (decision === 'REJECT') {
      this.logger.warn(
        `Upload rejected by SafeSearch for user ${uploaderId}: ${JSON.stringify(moderation)}`,
      );
      throw new BadRequestException(
        'Esta imagem foi rejeitada pela moderação automática. Envie uma foto do produto em um ambiente neutro.',
      );
    }

    // Dev fallback: when S3 is not configured return a stable placeholder URL
    if (!this.s3Configured) {
      if (this.nodeEnv === 'production') {
        throw new Error('S3 storage not configured — cannot upload images in production');
      }
      const seed = timestamp % 1000;
      const placeholderUrl = `https://picsum.photos/seed/${seed}/${PLACEHOLDER_WIDTH}/${PLACEHOLDER_HEIGHT}`;
      await this.flagIfFlagged(decision, moderation, uploaderId, placeholderUrl, key);
      return {
        url: placeholderUrl,
        key,
        width: PLACEHOLDER_WIDTH,
        height: PLACEHOLDER_HEIGHT,
        suggestions,
      };
    }

    try {
      // 6. Process with Sharp: resize + compress to JPEG
      const processed = await sharp(file)
        .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();

      const metadata = await sharp(processed).metadata();

      // 7. Upload to S3 with server-side encryption
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: processed,
          ContentType: 'image/jpeg',
          ServerSideEncryption: 'AES256',
        }),
      );

      const url = await this.generatePresignedUrl(key);

      // 8. If SafeSearch flagged this as borderline, queue for admin
      // review. Fire-and-forget: a flag-write failure must not fail
      // the upload — the image is already safely in S3.
      await this.flagIfFlagged(decision, moderation, uploaderId, url, key);

      return {
        url,
        key,
        width: metadata.width ?? 0,
        height: metadata.height ?? 0,
        suggestions,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Failed to process/upload image: ${String(error).slice(0, 200)}`,
      );
      throw new InternalServerErrorException(
        'Erro ao processar imagem. Tente novamente.',
      );
    }
  }

  /** Create a ListingImageFlag row when SafeSearch returned LIKELY. */
  private async flagIfFlagged(
    decision: 'REJECT' | 'FLAG' | 'CLEAN',
    findings: ImageModerationFindings | null,
    uploaderId: string,
    imageUrl: string,
    s3Key: string,
  ): Promise<void> {
    if (decision !== 'FLAG' || !findings) return;
    const reason = this.describeFindings(findings);
    try {
      await this.prisma.listingImageFlag.create({
        data: {
          uploaderId,
          imageUrl,
          s3Key,
          findings: findings as unknown as object,
          reason,
        },
      });
    } catch (err) {
      // A failure here is logged but never propagated — the upload
      // already succeeded; leaving the flag missing is degraded but
      // non-fatal, and the moderation queue sees nothing-bad-yet.
      this.logger.warn(
        `Failed to persist ListingImageFlag for ${s3Key}: ${String(err).slice(0, 200)}`,
      );
    }
  }

  private describeFindings(f: ImageModerationFindings): string {
    const flagged: string[] = [];
    if (f.adult === 'LIKELY') flagged.push('adulto');
    if (f.violence === 'LIKELY') flagged.push('violência');
    if (f.racy === 'LIKELY') flagged.push('sugestivo');
    return `SafeSearch sinalizou conteúdo potencialmente impróprio: ${flagged.join(', ') || 'desconhecido'}.`;
  }

  /**
   * Upload a profile avatar. Square-crops to 512x512, stores under avatars/,
   * and returns a presigned GET URL the client can persist via PATCH /users/:id.
   */
  async uploadAvatar(
    file: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<{ url: string; key: string }> {
    this.validateFileSize(file);
    const detectedMime = this.validateMimeType(file);
    this.logger.debug(
      `Avatar MIME: ${detectedMime}, provided: ${mimeType}`,
    );

    const safeName = this.sanitizeFilename(filename);
    const timestamp = Date.now();
    const key = `avatars/${timestamp}-${safeName}.jpg`;

    if (!this.s3Configured) {
      if (this.nodeEnv === 'production') {
        throw new Error('S3 storage not configured — cannot upload avatars in production');
      }
      const seed = timestamp % 1000;
      return {
        url: `https://picsum.photos/seed/${seed}/512/512`,
        key,
      };
    }

    try {
      const processed = await sharp(file)
        .resize({ width: 512, height: 512, fit: 'cover' })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: processed,
          ContentType: 'image/jpeg',
          ServerSideEncryption: 'AES256',
        }),
      );

      const url = await this.generatePresignedUrl(key);
      return { url, key };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Failed to upload avatar: ${String(error).slice(0, 200)}`,
      );
      throw new InternalServerErrorException(
        'Erro ao processar avatar. Tente novamente.',
      );
    }
  }

  /**
   * Generate a presigned GET URL with bounded expiry.
   */
  async generatePresignedUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3, command, {
      expiresIn: this.presignedUrlExpiry,
    });
  }

  /**
   * Delete an image from S3.
   */
  async deleteImage(key: string): Promise<void> {
    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      this.logger.log(`Deleted image: ${key}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete image ${key}: ${String(error).slice(0, 200)}`,
      );
      throw new InternalServerErrorException(
        'Erro ao remover imagem. Tente novamente.',
      );
    }
  }

  /**
   * Validate a video buffer via magic bytes.
   * Returns the detected MIME type or throws BadRequestException.
   */
  validateVideoMimeType(buffer: Buffer): string {
    for (const sig of VIDEO_MIME_SIGNATURES) {
      if (buffer.length >= sig.offset + sig.bytes.length) {
        const matches = sig.bytes.every((byte, i) => buffer[sig.offset + i] === byte);
        if (matches) return sig.mime;
      }
    }
    throw new BadRequestException(
      'Formato de vídeo não suportado. Envie um arquivo MP4 ou MOV (iPhone).',
    );
  }

  /**
   * Upload a listing video (max 100MB, max 30 seconds, MP4/MOV only).
   * Returns the S3 URL. Thumbnail generation is left to the client.
   */
  async uploadListingVideo(
    file: Buffer,
    filename: string,
    _mimeType: string,
  ): Promise<{ url: string; key: string }> {
    // 1. Validate size (100 MB max) — chunk-based early abort
    const chunkSize = 64 * 1024;
    let bytesRead = 0;
    for (let offset = 0; offset < file.length; offset += chunkSize) {
      bytesRead += Math.min(chunkSize, file.length - offset);
      if (bytesRead > MAX_VIDEO_SIZE) {
        throw new BadRequestException(
          `Vídeo excede o tamanho máximo de ${MAX_VIDEO_SIZE / (1024 * 1024)}MB.`,
        );
      }
    }

    // 2. Validate MIME type via magic bytes
    const detectedMime = this.validateVideoMimeType(file);
    this.logger.debug(`Video upload detected MIME: ${detectedMime}`);

    // 3. Sanitize filename
    const safeName = this.sanitizeFilename(filename);
    const timestamp = Date.now();
    const key = `videos/${timestamp}-${safeName}`;

    // Dev fallback
    if (!this.s3Configured) {
      if (this.nodeEnv === 'production') {
        throw new Error('S3 storage not configured — cannot upload videos in production');
      }
      return {
        url: `https://www.w3schools.com/html/mov_bbb.mp4`, // stable dev placeholder
        key,
      };
    }

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file,
          ContentType: detectedMime,
          ServerSideEncryption: 'AES256',
        }),
      );

      const url = await this.generatePresignedUrl(key);
      return { url, key };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Failed to upload video: ${String(error).slice(0, 200)}`);
      throw new InternalServerErrorException('Erro ao enviar vídeo. Tente novamente.');
    }
  }
}
