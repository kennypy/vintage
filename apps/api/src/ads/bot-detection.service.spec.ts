import { Test, TestingModule } from '@nestjs/testing';
import { BotDetectionService } from './bot-detection.service';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

const mockPrisma = {
  adClick: { count: jest.fn().mockResolvedValue(0) },
  adImpression: { count: jest.fn().mockResolvedValue(1) },
};

function hashIp(ip: string) {
  return crypto.createHash('sha256').update(ip).digest('hex');
}

describe('BotDetectionService', () => {
  let service: BotDetectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotDetectionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<BotDetectionService>(BotDetectionService);
    jest.clearAllMocks();
    mockPrisma.adClick.count.mockResolvedValue(0);
    mockPrisma.adImpression.count.mockResolvedValue(1);
  });

  it('scores Googlebot UA as bot', async () => {
    const result = await service.score({
      ip: '66.249.64.1',
      ipHash: hashIp('66.249.64.1'),
      userAgent: 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      campaignId: 'c1',
    });
    expect(result.isBot).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.7);
  });

  it('scores headless chrome as bot', async () => {
    const result = await service.score({
      ip: '1.2.3.4',
      ipHash: hashIp('1.2.3.4'),
      userAgent: 'Mozilla/5.0 HeadlessChrome/114',
      campaignId: 'c1',
    });
    expect(result.isBot).toBe(true);
  });

  it('scores sub-300ms click as suspicious', async () => {
    const result = await service.score({
      ip: '200.100.50.1',
      ipHash: hashIp('200.100.50.1'),
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
      msToClick: 50,
      campaignId: 'c1',
    });
    expect(result.signals.tooFast).toBe(true);
  });

  it('scores high click velocity from same IP as suspicious', async () => {
    mockPrisma.adClick.count.mockResolvedValue(10);
    const result = await service.score({
      ip: '200.100.50.1',
      ipHash: hashIp('200.100.50.1'),
      userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
      campaignId: 'c1',
    });
    expect(result.signals.highVelocity).toBe(true);
  });

  it('scores missing impressionId as suspicious', async () => {
    const result = await service.score({
      ip: '200.100.50.1',
      ipHash: hashIp('200.100.50.1'),
      userAgent: 'Mozilla/5.0 (Android 13)',
      campaignId: 'c1',
      // no impressionId
    });
    expect(result.signals.missingImpressionId).toBe(true);
  });

  it('gives low score for normal mobile browser', async () => {
    mockPrisma.adImpression.count.mockResolvedValue(1);
    const result = await service.score({
      ip: '200.100.50.1',
      ipHash: hashIp('200.100.50.1'),
      userAgent:
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/114 Mobile Safari/537.36',
      msToClick: 1500,
      impressionId: 'imp-1',
      campaignId: 'c1',
      userId: 'user-1',
    });
    expect(result.isBot).toBe(false);
    expect(result.score).toBeLessThan(0.4);
  });
});
