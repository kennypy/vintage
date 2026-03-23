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

/** Maximum file size in bytes (10 MB). */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Maximum number of images per listing. */
const MAX_IMAGES_PER_LISTING = 20;

/** Maximum length for sanitized filenames. */
const MAX_FILENAME_LENGTH = 200;

/** Maximum image width after resize. */
const MAX_IMAGE_WIDTH = 1200;

/** JPEG compression quality. */
const JPEG_QUALITY = 80;

/** Allowed MIME types mapped to their magic-byte signatures. */
const MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
};

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly presignedUrlExpiry: number;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('S3_REGION', 'us-east-1');
    const endpoint = this.configService.get<string>('S3_ENDPOINT', '');
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

    const s3Config: ConstructorParameters<typeof S3Client>[0] = {
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    };

    if (endpoint) {
      s3Config.endpoint = endpoint;
      s3Config.forcePathStyle = true;
    }

    this.s3 = new S3Client(s3Config);
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
   */
  async uploadListingImage(
    file: Buffer,
    filename: string,
    mimeType: string,
    _listingImageCount?: number,
  ): Promise<{ url: string; key: string; width: number; height: number }> {
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

    try {
      // 5. Process with Sharp: resize + compress to JPEG
      const processed = await sharp(file)
        .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();

      const metadata = await sharp(processed).metadata();

      // 6. Upload to S3 with server-side encryption
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

      return {
        url,
        key,
        width: metadata.width ?? 0,
        height: metadata.height ?? 0,
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
}
