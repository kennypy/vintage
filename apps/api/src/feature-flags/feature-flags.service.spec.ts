import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  featureFlag: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FeatureFlagsService>(FeatureFlagsService);
  });

  describe('findAll', () => {
    it('should return all flags ordered by key', async () => {
      const flags = [
        { id: '1', key: 'coupons', enabled: true, description: null, metadata: null, updatedAt: new Date(), createdAt: new Date() },
        { id: '2', key: 'video_upload', enabled: false, description: 'Upload de vídeo', metadata: null, updatedAt: new Date(), createdAt: new Date() },
      ];
      mockPrisma.featureFlag.findMany.mockResolvedValue(flags);

      const result = await service.findAll();

      expect(result).toEqual(flags);
      expect(mockPrisma.featureFlag.findMany).toHaveBeenCalledWith({
        orderBy: { key: 'asc' },
      });
    });
  });

  describe('create', () => {
    it('should create a new feature flag', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue(null);
      const created = { id: '1', key: 'video_upload', enabled: false, description: 'Upload de vídeo', metadata: null, updatedAt: new Date(), createdAt: new Date() };
      mockPrisma.featureFlag.create.mockResolvedValue(created);

      const result = await service.create({ key: 'video_upload', description: 'Upload de vídeo' });

      expect(result).toEqual(created);
      expect(mockPrisma.featureFlag.create).toHaveBeenCalledWith({
        data: {
          key: 'video_upload',
          enabled: false,
          description: 'Upload de vídeo',
          metadata: undefined,
        },
      });
    });

    it('should throw ConflictException if key already exists', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue({ id: '1', key: 'video_upload' });

      await expect(service.create({ key: 'video_upload' })).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should toggle a flag', async () => {
      const existing = { id: '1', key: 'video_upload', enabled: false };
      mockPrisma.featureFlag.findUnique.mockResolvedValue(existing);
      const updated = { ...existing, enabled: true };
      mockPrisma.featureFlag.update.mockResolvedValue(updated);

      const result = await service.update('1', { enabled: true });

      expect(result.enabled).toBe(true);
    });

    it('should throw NotFoundException if flag does not exist', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', { enabled: true })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a flag', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue({ id: '1', key: 'video_upload' });
      mockPrisma.featureFlag.delete.mockResolvedValue({});

      const result = await service.remove('1');

      expect(result).toEqual({ deleted: true, id: '1' });
    });

    it('should throw NotFoundException if flag does not exist', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
