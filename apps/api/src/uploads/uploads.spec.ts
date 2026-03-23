import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { UploadsService } from './uploads.service';

// Mock S3 client
const mockSend = jest.fn().mockResolvedValue({});
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutObjectCommand: jest.fn().mockImplementation((params) => ({
      ...params,
      _type: 'PutObjectCommand',
    })),
    DeleteObjectCommand: jest.fn().mockImplementation((params) => ({
      ...params,
      _type: 'DeleteObjectCommand',
    })),
    GetObjectCommand: jest.fn().mockImplementation((params) => ({
      ...params,
      _type: 'GetObjectCommand',
    })),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest
    .fn()
    .mockResolvedValue('https://s3.example.com/presigned-url'),
}));

// Mock Sharp
const mockSharpInstance = {
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
  metadata: jest.fn().mockResolvedValue({ width: 800, height: 600 }),
};

jest.mock('sharp', () => {
  return jest.fn().mockImplementation(() => mockSharpInstance);
});

describe('UploadsService', () => {
  let service: UploadsService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const config: Record<string, string> = {
        S3_REGION: 'us-east-1',
        S3_ENDPOINT: '',
        S3_ACCESS_KEY: 'test-key',
        S3_SECRET_KEY: 'test-secret',
        S3_BUCKET: 'test-bucket',
        PRESIGNED_URL_EXPIRY: '3600',
      };
      return config[key] ?? defaultValue ?? '';
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Re-setup sharp mock after clearAllMocks
    mockSharpInstance.resize.mockReturnThis();
    mockSharpInstance.jpeg.mockReturnThis();
    mockSharpInstance.toBuffer.mockResolvedValue(
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    );
    mockSharpInstance.metadata.mockResolvedValue({ width: 800, height: 600 });
    mockSend.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<UploadsService>(UploadsService);
  });

  describe('validateMimeType', () => {
    it('should accept JPEG files (magic bytes FF D8 FF)', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const mime = service.validateMimeType(jpegBuffer);
      expect(mime).toBe('image/jpeg');
    });

    it('should accept PNG files (magic bytes 89 50 4E 47)', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      const mime = service.validateMimeType(pngBuffer);
      expect(mime).toBe('image/png');
    });

    it('should reject files with unknown magic bytes', () => {
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38]);
      expect(() => service.validateMimeType(gifBuffer)).toThrow(
        BadRequestException,
      );
    });

    it('should reject empty buffers', () => {
      const emptyBuffer = Buffer.alloc(0);
      expect(() => service.validateMimeType(emptyBuffer)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('sanitizeFilename', () => {
    it('should strip null bytes', () => {
      const result = service.sanitizeFilename('photo\x00.jpg');
      expect(result).toBe('photo.jpg');
      expect(result).not.toContain('\x00');
    });

    it('should strip forward slashes', () => {
      const result = service.sanitizeFilename('../../etc/passwd');
      expect(result).not.toContain('/');
      expect(result).not.toContain('..');
    });

    it('should strip backslashes', () => {
      const result = service.sanitizeFilename('..\\..\\windows\\system32');
      expect(result).not.toContain('\\');
    });

    it('should limit filename length', () => {
      const longName = 'a'.repeat(300) + '.jpg';
      const result = service.sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it('should return fallback for empty filenames', () => {
      const result = service.sanitizeFilename('');
      expect(result).toBe('upload');
    });
  });

  describe('validateFileSize', () => {
    it('should accept files under 10MB', () => {
      const smallBuffer = Buffer.alloc(5 * 1024 * 1024); // 5 MB
      expect(() => service.validateFileSize(smallBuffer)).not.toThrow();
    });

    it('should reject files over 10MB', () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11 MB
      expect(() => service.validateFileSize(largeBuffer)).toThrow(
        BadRequestException,
      );
    });

    it('should accept files exactly at 10MB', () => {
      const exactBuffer = Buffer.alloc(10 * 1024 * 1024); // Exactly 10 MB
      expect(() => service.validateFileSize(exactBuffer)).not.toThrow();
    });
  });

  describe('uploadListingImage', () => {
    const validJpegBuffer = Buffer.alloc(1024);
    // Set JPEG magic bytes
    validJpegBuffer[0] = 0xff;
    validJpegBuffer[1] = 0xd8;
    validJpegBuffer[2] = 0xff;

    it('should upload a valid JPEG image successfully', async () => {
      const result = await service.uploadListingImage(
        validJpegBuffer,
        'test-photo.jpg',
        'image/jpeg',
      );

      expect(result.url).toBeDefined();
      expect(result.key).toContain('listings/');
      expect(result.key).toContain('.jpg');
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
    });

    it('should resize and compress images with Sharp', async () => {
      await service.uploadListingImage(
        validJpegBuffer,
        'photo.jpg',
        'image/jpeg',
      );

      const sharp = require('sharp');
      expect(sharp).toHaveBeenCalled();
      expect(mockSharpInstance.resize).toHaveBeenCalledWith({
        width: 1200,
        withoutEnlargement: true,
      });
      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 80 });
    });

    it('should upload to S3 with AES256 server-side encryption', async () => {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');

      await service.uploadListingImage(
        validJpegBuffer,
        'photo.jpg',
        'image/jpeg',
      );

      expect(mockSend).toHaveBeenCalled();
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ServerSideEncryption: 'AES256',
          Bucket: 'test-bucket',
          ContentType: 'image/jpeg',
        }),
      );
    });

    it('should reject when max images per listing is reached', async () => {
      await expect(
        service.uploadListingImage(
          validJpegBuffer,
          'photo.jpg',
          'image/jpeg',
          20,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject files with invalid MIME type', async () => {
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39]);
      await expect(
        service.uploadListingImage(gifBuffer, 'image.gif', 'image/gif'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should sanitize filenames in the S3 key', async () => {
      const result = await service.uploadListingImage(
        validJpegBuffer,
        '../../etc/passwd.jpg',
        'image/jpeg',
      );

      expect(result.key).not.toContain('..');
      expect(result.key).not.toContain('/etc/');
    });
  });

  describe('generatePresignedUrl', () => {
    it('should return a presigned URL', async () => {
      const url = await service.generatePresignedUrl('listings/test.jpg');
      expect(url).toBe('https://s3.example.com/presigned-url');
    });

    it('should use configured expiry', async () => {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

      await service.generatePresignedUrl('listings/test.jpg');

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 3600 },
      );
    });
  });

  describe('deleteImage', () => {
    it('should delete an image from S3', async () => {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

      await service.deleteImage('listings/test.jpg');

      expect(mockSend).toHaveBeenCalled();
      expect(DeleteObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: 'listings/test.jpg',
        }),
      );
    });

    it('should throw InternalServerErrorException on S3 failure', async () => {
      mockSend.mockRejectedValueOnce(new Error('S3 error'));

      await expect(
        service.deleteImage('listings/test.jpg'),
      ).rejects.toThrow();
    });
  });
});
