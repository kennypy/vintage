import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
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

/**
 * Hard ceiling on the DECODED pixel count of an uploaded image.
 *
 * The 10 MB byte gate and the 3-byte magic check say nothing about the
 * canvas: a highly-compressible single-colour PNG of 16383×16383 is a
 * few hundred KB on the wire but ~1 GB of RGBA once libvips materialises
 * it — and the resize to MAX_IMAGE_WIDTH only runs AFTER that decode.
 * On the 1 GB machines we provision, one such request OOM-kills the API
 * for every user. sharp's own default (~268 MP) is far above what our
 * container can survive, so we set our own.
 *
 * 40 MP is ~8000×5000 — well beyond any phone camera a seller will use.
 */
const MAX_IMAGE_PIXELS = 40_000_000;

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
  // Removed the `offset:0, bytes:[0x00,0x00,0x00]` "QuickTime fallback":
  // it accepted ANY file whose first three bytes are 0x00 (arbitrary
  // binaries / polyglots), defeating magic-byte validation for the video
  // surface. Real MP4/MOV files carry the `ftyp` box at offset 4, which the
  // two signatures above already match.
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
    const endpoint = this.configService.get<string>('S3_ENDPOINT', '');
    // Region handling: AWS S3 needs a real region ('us-east-1', 'sa-east-1').
    // Cloudflare R2 is region-neutral and expects 'auto' — passing a real
    // AWS region against R2 makes presigned URLs fail signature validation
    // on redirect. We infer R2 from the endpoint hostname so ops don't have
    // to remember the quirk, and fall back to the explicit env var when set.
    const explicitRegion = this.configService.get<string>('S3_REGION', '');
    const isR2Endpoint = /\.r2\.cloudflarestorage\.com$/i.test(
      (() => {
        try {
          return endpoint ? new URL(endpoint).hostname : '';
        } catch {
          return '';
        }
      })(),
    );
    const region =
      explicitRegion || (isR2Endpoint ? 'auto' : 'us-east-1');

    // SSRF defense: reject endpoints pointing at loopback, metadata services,
    // or private IPs. Fails fast at startup.
    assertSafeS3Endpoint(endpoint);

    if (isR2Endpoint && explicitRegion && explicitRegion !== 'auto') {
      this.logger.warn(
        `S3_REGION="${explicitRegion}" with an R2 endpoint — R2 signs with 'auto'. Presigned URLs may 403. Set S3_REGION=auto or unset it.`,
      );
    }
    const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY', '');
    const secretAccessKey = this.configService.get<string>(
      'S3_SECRET_KEY',
      '',
    );

    this.bucket = this.configService.get<string>(
      'S3_BUCKET',
      'vintage-uploads',
    );
    // Presigned URL lifetime. Clamped to [60s, 24h]. A misconfigured
    // env (e.g. `PRESIGNED_URL_EXPIRY=31536000`) would otherwise ship
    // year-long links harvestable from logs / email threads / chat
    // message history — listing photos are low-value, but identity
    // document scans (kyc/*) reuse the same S3 client, and a leaked
    // year-long URL to a CPF scan is a reportable incident.
    const PRESIGNED_URL_MAX_SECONDS = 24 * 60 * 60; // 24h
    const PRESIGNED_URL_MIN_SECONDS = 60;
    const rawExpiry = Number(
      this.configService.get<string>('PRESIGNED_URL_EXPIRY', '3600'),
    );
    const safeExpiry = Number.isFinite(rawExpiry) && rawExpiry > 0
      ? Math.min(Math.max(rawExpiry, PRESIGNED_URL_MIN_SECONDS), PRESIGNED_URL_MAX_SECONDS)
      : 3600;
    if (safeExpiry !== rawExpiry) {
      this.logger.warn(
        `PRESIGNED_URL_EXPIRY=${rawExpiry} clamped to ${safeExpiry}s (allowed range: ${PRESIGNED_URL_MIN_SECONDS}–${PRESIGNED_URL_MAX_SECONDS}s).`,
      );
    }
    this.presignedUrlExpiry = safeExpiry;

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

    // 5a. SafeSearch gate. classifyModeration returns 'FLAG' when
    // moderation is null (Vision disabled / outage) — fail-REVIEW
    // rather than fail-open, so a Vision outage can't silently
    // disable moderation for the duration. FLAG uploads still land
    // (no user-facing latency from a vendor hiccup) but get queued
    // in ListingImageFlag for admin sign-off before they surface
    // to buyers. REJECT still refuses outright.
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
      await this.recordUploadOwnership(key, uploaderId);
      return {
        url: placeholderUrl,
        key,
        width: PLACEHOLDER_WIDTH,
        height: PLACEHOLDER_HEIGHT,
        suggestions,
      };
    }

    // Reject oversized canvases from the header BEFORE any full decode.
    const pipeline = await this.guardedSharp(file);

    try {
      // 6. Process with Sharp: resize + compress to JPEG
      const processed = await pipeline
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

      // 9. Record who owns this key so deleteImage() can authorize a
      // future delete against a server-written record, not the caller's
      // own url string.
      await this.recordUploadOwnership(key, uploaderId);

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

  /**
   * Refuse an image whose declared canvas exceeds MAX_IMAGE_PIXELS,
   * reading only the header — no full decode. `limitInputPixels` makes
   * libvips itself refuse to materialise anything larger, so a lying
   * header cannot get past the subsequent pipeline either.
   *
   * Returns a sharp instance configured with the same limits, so callers
   * decode through the guarded pipeline rather than a fresh unguarded one.
   */
  private async guardedSharp(file: Buffer): Promise<sharp.Sharp> {
    const pipeline = sharp(file, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: 'truncated',
    });

    let meta: sharp.Metadata;
    try {
      meta = await pipeline.metadata();
    } catch {
      throw new BadRequestException('Imagem inválida ou corrompida.');
    }

    const pixels = (meta.width ?? 0) * (meta.height ?? 0);
    if (pixels <= 0) {
      throw new BadRequestException('Não foi possível ler as dimensões da imagem.');
    }
    if (pixels > MAX_IMAGE_PIXELS) {
      throw new BadRequestException(
        'Imagem excede o limite de resolução permitido.',
      );
    }

    return pipeline;
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
   * Record server-side provenance for a key we just uploaded. This is the
   * ONLY writer of UploadObject, which makes it the non-forgeable source of
   * truth deleteImage() authorizes against — ownership is never inferred
   * from the user-writable url columns. Keyed on s3Key (unique): a
   * re-upload to the same key overwrites the S3 bytes, so ownership is
   * transferred to the last writer.
   *
   * Best-effort: a failure here is logged but never fails the upload — the
   * bytes are already stored. A missing record only means the owner cannot
   * delete the object via DELETE /uploads/:key (fail-closed), never that
   * someone else can.
   */
  private async recordUploadOwnership(
    s3Key: string,
    uploaderId: string,
  ): Promise<void> {
    try {
      await this.prisma.uploadObject.upsert({
        where: { s3Key },
        create: { s3Key, uploaderId },
        update: { uploaderId },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to record upload ownership for ${s3Key}: ${String(err).slice(0, 200)}`,
      );
    }
  }

  /**
   * Upload a profile avatar. Square-crops to 512x512, stores under avatars/,
   * and returns a presigned GET URL the client can persist via PATCH /users/:id.
   */
  async uploadAvatar(
    file: Buffer,
    filename: string,
    mimeType: string,
    userId: string,
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
      const placeholderUrl = `https://picsum.photos/seed/${seed}/512/512`;
      // Persist the avatar URL on the user row even in dev so the rest
      // of the app (profile pages, message threads) sees the upload.
      await this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: placeholderUrl },
      });
      await this.recordUploadOwnership(key, userId);
      return { url: placeholderUrl, key };
    }

    // Same decode guard as the listing-image path.
    const pipeline = await this.guardedSharp(file);

    try {
      const processed = await pipeline
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
      // Atomically tie the new avatar key to the user. Without this row
      // update, the deleteImage authorization check below has nothing to
      // match against — the avatar would be orphaned and unrecoverable.
      await this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: url },
      });
      await this.recordUploadOwnership(key, userId);
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
   * Delete an S3 object. Any authenticated caller can hit
   * DELETE /uploads/:key, so ownership must be proven before we touch S3.
   *
   * Ownership is decided ONLY by the server-written UploadObject table
   * (see assertCanDelete), which UploadsService populates at upload time.
   * It is NOT derived from ListingImage.url / ListingVideo.url /
   * User.avatarUrl — those columns are client-writable (validated only
   * for hostname), so a caller could otherwise mint "ownership evidence"
   * for any key by planting it inside one of their own image URLs and
   * delete another user's object (CWE-639 IDOR).
   *
   * A key with no matching ownership row for this caller is refused with
   * a 403 — we never swallow-succeed on an unknown key, which would give
   * an attacker a fish-for-keys side channel.
   */
  async deleteImage(key: string, userId: string): Promise<void> {
    const normalised = key.trim();
    if (!normalised) {
      throw new BadRequestException('Chave do arquivo é obrigatória.');
    }

    const authorized = await this.assertCanDelete(normalised, userId);
    if (!authorized) {
      throw new ForbiddenException(
        'Você não tem permissão para remover este arquivo.',
      );
    }

    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: normalised,
        }),
      );
      // Drop the provenance row now the object is gone. Scoped to the
      // owning caller so this can never clear someone else's record.
      await this.prisma.uploadObject.deleteMany({
        where: { s3Key: normalised, uploaderId: userId },
      });
      this.logger.log(`Deleted ${normalised} for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete ${normalised}: ${String(error).slice(0, 200)}`,
      );
      throw new InternalServerErrorException(
        'Erro ao remover imagem. Tente novamente.',
      );
    }
  }

  /**
   * Returns true only when a server-written UploadObject row records that
   * `userId` uploaded the object stored at exactly `key`. This record is
   * written solely by UploadsService (recordUploadOwnership), so it cannot
   * be forged by a caller: unlike the ListingImage.url / ListingVideo.url /
   * User.avatarUrl columns, nothing a client submits can create or point a
   * row at a key it did not actually upload. Exact `s3Key` equality (not a
   * substring/`contains` match) closes the substring-forgery hole.
   */
  private async assertCanDelete(key: string, userId: string): Promise<boolean> {
    const record = await this.prisma.uploadObject.findFirst({
      where: { s3Key: key, uploaderId: userId },
      select: { id: true },
    });
    return record !== null;
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
    userId: string,
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
      await this.recordUploadOwnership(key, userId);
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
      await this.recordUploadOwnership(key, userId);
      return { url, key };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Failed to upload video: ${String(error).slice(0, 200)}`);
      throw new InternalServerErrorException('Erro ao enviar vídeo. Tente novamente.');
    }
  }
}
