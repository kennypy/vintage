import { Test, TestingModule } from '@nestjs/testing';
import { ConsentService } from './consent.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentType } from '@prisma/client';

const mockPrisma = {
  consentRecord: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

describe('ConsentService', () => {
  let service: ConsentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsentService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<ConsentService>(ConsentService);
    jest.clearAllMocks();
  });

  it('returns false for all types when no records exist', async () => {
    mockPrisma.consentRecord.findMany.mockResolvedValue([]);
    const result = await service.getConsents('user1');
    expect(result[ConsentType.PERSONALIZED_ADS]).toBe(false);
    expect(result[ConsentType.ANALYTICS]).toBe(false);
  });

  it('reflects latest consent state', async () => {
    mockPrisma.consentRecord.findMany.mockResolvedValue([
      {
        consentType: ConsentType.ANALYTICS,
        granted: true,
        revokedAt: null,
      },
    ]);
    const result = await service.getConsents('user1');
    expect(result[ConsentType.ANALYTICS]).toBe(true);
  });

  it('creates a consent record on update', async () => {
    mockPrisma.consentRecord.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.consentRecord.create.mockResolvedValue({});
    await service.updateConsent('user1', ConsentType.PERSONALIZED_ADS, true, '127.0.0.1');
    expect(mockPrisma.consentRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ granted: true }) }),
    );
  });

  it('sets revokedAt on existing grants when revoking', async () => {
    mockPrisma.consentRecord.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.consentRecord.create.mockResolvedValue({});
    await service.updateConsent('user1', ConsentType.PERSONALIZED_ADS, false, '127.0.0.1');
    expect(mockPrisma.consentRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ granted: true, revokedAt: null }),
      }),
    );
  });

  it('hasConsent returns false when no record exists', async () => {
    mockPrisma.consentRecord.findFirst.mockResolvedValue(null);
    expect(await service.hasConsent('user1', ConsentType.ANALYTICS)).toBe(false);
  });
});
