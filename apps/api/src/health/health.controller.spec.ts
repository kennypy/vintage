import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/services/redis.service';

const mockPrisma = {
  $queryRaw: jest.fn(),
};

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
  ping: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
};

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('check', () => {
    it('should return ok status', () => {
      const result = controller.check();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
    });

    it('should return a valid ISO timestamp', () => {
      const result = controller.check();

      const parsed = new Date(result.timestamp);
      expect(parsed.toISOString()).toBe(result.timestamp);
    });
  });

  describe('ready', () => {
    it('should return ok when database is healthy', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ result: 1 }]);
      mockRedisService.ping.mockResolvedValue(true);
      mockConfigService.get.mockImplementation(
        (k: string, def?: string) => (k === 'MEILISEARCH_HOST' ? '' : def ?? ''),
      );

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await controller.ready(res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
          checks: expect.objectContaining({
            database: 'ok',
            redis: 'ok',
            meilisearch: 'skipped',
          }),
        }),
      );
    });

    it('should return 503 degraded when database is down', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
      mockRedisService.ping.mockResolvedValue(true);
      mockConfigService.get.mockImplementation(
        (k: string, def?: string) => (k === 'MEILISEARCH_HOST' ? '' : def ?? ''),
      );

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await controller.ready(res as any);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'degraded',
          checks: expect.objectContaining({
            database: 'error',
          }),
        }),
      );
    });
  });
});
