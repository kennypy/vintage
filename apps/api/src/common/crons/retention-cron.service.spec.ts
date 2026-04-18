import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RetentionCronService } from './retention-cron.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CronLockService } from '../services/cron-lock.service';

// Mock the S3 SDK so no real network calls are attempted.
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  DeleteObjectCommand: jest.fn((args: unknown) => args),
}));

const mockPrisma = {
  loginEvent: { deleteMany: jest.fn() },
  processedWebhook: { deleteMany: jest.fn() },
  listingImageFlag: { deleteMany: jest.fn() },
  fraudFlag: { deleteMany: jest.fn() },
  orderListingSnapshot: { count: jest.fn() },
  listing: {
    findMany: jest.fn(),
    delete: jest.fn(),
  },
};

const mockCronLock = { acquire: jest.fn().mockResolvedValue(true) };

function makeConfig(overrides: Record<string, string> = {}) {
  return {
    get: jest.fn((key: string, def?: string) => overrides[key] ?? def ?? ''),
  };
}

describe('RetentionCronService', () => {
  let service: RetentionCronService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        RetentionCronService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CronLockService, useValue: mockCronLock },
        {
          provide: ConfigService,
          useValue: makeConfig({
            RETENTION_LOGIN_EVENT_DAYS: '90',
            RETENTION_PROCESSED_WEBHOOK_DAYS: '30',
            RETENTION_LISTING_IMAGE_FLAG_DAYS: '365',
            RETENTION_FRAUD_FLAG_DAYS: '365',
            ORPHAN_IMAGE_SWEEP_DAYS: '30',
            // Leave S3 unconfigured so sweepOrphanImages short-circuits
            // unless a test explicitly re-instantiates with creds.
          }),
        },
      ],
    }).compile();
    service = mod.get<RetentionCronService>(RetentionCronService);
  });

  describe('purgeRetainedRows', () => {
    beforeEach(() => {
      mockPrisma.loginEvent.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.processedWebhook.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.listingImageFlag.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.fraudFlag.deleteMany.mockResolvedValue({ count: 0 });
    });

    it('returns silently when cron-lock is held', async () => {
      mockCronLock.acquire.mockResolvedValueOnce(false);
      await service.purgeRetainedRows();
      expect(mockPrisma.loginEvent.deleteMany).not.toHaveBeenCalled();
    });

    it('purges every target table with a time cutoff', async () => {
      await service.purgeRetainedRows();
      expect(mockPrisma.loginEvent.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ createdAt: expect.any(Object) }) }),
      );
      expect(mockPrisma.processedWebhook.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.listingImageFlag.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.fraudFlag.deleteMany).toHaveBeenCalled();
    });

    it('skips PENDING rows on flag tables so unresolved signals survive retention', async () => {
      await service.purgeRetainedRows();

      const imageCall = mockPrisma.listingImageFlag.deleteMany.mock.calls[0][0];
      const fraudCall = mockPrisma.fraudFlag.deleteMany.mock.calls[0][0];

      expect(imageCall.where.status).toEqual({ not: 'PENDING' });
      expect(fraudCall.where.status).toEqual({ not: 'PENDING' });
    });

    it('continues when one table throws (others still purge)', async () => {
      mockPrisma.loginEvent.deleteMany.mockRejectedValueOnce(new Error('pg down'));
      await expect(service.purgeRetainedRows()).resolves.not.toThrow();
      // The later tables still get called.
      expect(mockPrisma.processedWebhook.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.fraudFlag.deleteMany).toHaveBeenCalled();
    });
  });

  describe('sweepOrphanImages', () => {
    it('short-circuits when S3 is not configured (dev mode)', async () => {
      await service.sweepOrphanImages();
      expect(mockPrisma.listing.findMany).not.toHaveBeenCalled();
    });

    describe('with S3 configured', () => {
      beforeEach(async () => {
        jest.clearAllMocks();
        // Re-instantiate with S3 creds so the S3 client is real.
        const mod: TestingModule = await Test.createTestingModule({
          providers: [
            RetentionCronService,
            { provide: PrismaService, useValue: mockPrisma },
            { provide: CronLockService, useValue: mockCronLock },
            {
              provide: ConfigService,
              useValue: makeConfig({
                S3_ACCESS_KEY: 'test-access',
                S3_SECRET_KEY: 'test-secret',
                S3_BUCKET: 'vintage-test',
                S3_REGION: 'auto',
                S3_ENDPOINT: 'https://abc.r2.cloudflarestorage.com',
                ORPHAN_IMAGE_SWEEP_DAYS: '30',
              }),
            },
          ],
        }).compile();
        service = mod.get<RetentionCronService>(RetentionCronService);
      });

      it('skips listings that still have a snapshot reference', async () => {
        mockPrisma.listing.findMany.mockResolvedValue([
          { id: 'listing-1', images: [{ id: 'img-1', url: 'https://abc.r2.cloudflarestorage.com/vintage-test/listings/foo.jpg' }] },
        ]);
        mockPrisma.orderListingSnapshot.count.mockResolvedValue(1);

        await service.sweepOrphanImages();

        expect(mockPrisma.listing.delete).not.toHaveBeenCalled();
      });

      it('hard-deletes the listing after reaping every image key', async () => {
        mockPrisma.listing.findMany.mockResolvedValue([
          {
            id: 'listing-1',
            images: [
              { id: 'img-1', url: 'https://abc.r2.cloudflarestorage.com/vintage-test/listings/a.jpg' },
              { id: 'img-2', url: 'https://abc.r2.cloudflarestorage.com/vintage-test/listings/b.jpg' },
            ],
          },
        ]);
        mockPrisma.orderListingSnapshot.count.mockResolvedValue(0);
        mockPrisma.listing.delete.mockResolvedValue({});

        await service.sweepOrphanImages();

        expect(mockPrisma.listing.delete).toHaveBeenCalledWith({
          where: { id: 'listing-1' },
        });
      });

      it('continues when one image delete throws', async () => {
        mockPrisma.listing.findMany.mockResolvedValue([
          {
            id: 'listing-1',
            images: [{ id: 'img-bad', url: 'not-a-url' }],
          },
        ]);
        mockPrisma.orderListingSnapshot.count.mockResolvedValue(0);
        mockPrisma.listing.delete.mockResolvedValue({});

        await expect(service.sweepOrphanImages()).resolves.not.toThrow();
        // Even with an un-parseable URL, the listing is still hard-deleted.
        expect(mockPrisma.listing.delete).toHaveBeenCalled();
      });
    });
  });
});
