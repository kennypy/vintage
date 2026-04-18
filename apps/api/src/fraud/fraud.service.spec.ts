import { Test, TestingModule } from '@nestjs/testing';
import { FraudService } from './fraud.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  fraudRule: { findFirst: jest.fn() },
  fraudFlag: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  user: { findUnique: jest.fn() },
  order: { count: jest.fn() },
  payoutMethod: { findUnique: jest.fn() },
};

describe('FraudService', () => {
  let service: FraudService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        FraudService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = mod.get<FraudService>(FraudService);
  });

  describe('evaluatePurchase — NEW_ACCOUNT_VELOCITY', () => {
    const velocityRule = {
      code: 'NEW_ACCOUNT_VELOCITY',
      threshold: 5,
      windowMinutes: 60,
      action: 'FLAG',
      description: 'velocity',
      enabled: true,
    };

    it('allows through when the rule is disabled (no row returned)', async () => {
      mockPrisma.fraudRule.findFirst.mockResolvedValue(null);

      const decision = await service.evaluatePurchase('buyer-1');
      expect(decision.action).toBe('ALLOW');
      expect(mockPrisma.order.count).not.toHaveBeenCalled();
    });

    it('allows through when the account is older than 7 days', async () => {
      mockPrisma.fraudRule.findFirst.mockResolvedValue(velocityRule);
      const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30d
      mockPrisma.user.findUnique.mockResolvedValue({ createdAt: old });

      const decision = await service.evaluatePurchase('buyer-1');
      expect(decision.action).toBe('ALLOW');
      expect(mockPrisma.order.count).not.toHaveBeenCalled();
    });

    it('allows through when velocity is below the threshold', async () => {
      mockPrisma.fraudRule.findFirst.mockResolvedValue(velocityRule);
      const fresh = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1d
      mockPrisma.user.findUnique.mockResolvedValue({ createdAt: fresh });
      mockPrisma.order.count.mockResolvedValue(2); // < 5

      const decision = await service.evaluatePurchase('buyer-1');
      expect(decision.action).toBe('ALLOW');
      expect(mockPrisma.fraudFlag.create).not.toHaveBeenCalled();
    });

    it('flags AND allows when velocity trips a FLAG rule', async () => {
      mockPrisma.fraudRule.findFirst.mockResolvedValue(velocityRule);
      const fresh = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      mockPrisma.user.findUnique.mockResolvedValue({ createdAt: fresh });
      mockPrisma.order.count.mockResolvedValue(7); // ≥ 5
      mockPrisma.fraudFlag.findFirst.mockResolvedValue(null); // no dedupe hit
      mockPrisma.fraudFlag.create.mockResolvedValue({ id: 'flag-1' });

      const decision = await service.evaluatePurchase('buyer-1');
      expect(decision.action).toBe('FLAG');
      expect(decision.ruleCode).toBe('NEW_ACCOUNT_VELOCITY');
      expect(decision.flagId).toBe('flag-1');
      expect(mockPrisma.fraudFlag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'buyer-1',
            ruleCode: 'NEW_ACCOUNT_VELOCITY',
          }),
        }),
      );
    });

    it('returns BLOCK when the rule action is BLOCK (caller must refuse)', async () => {
      mockPrisma.fraudRule.findFirst.mockResolvedValue({
        ...velocityRule,
        action: 'BLOCK',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      });
      mockPrisma.order.count.mockResolvedValue(99);
      mockPrisma.fraudFlag.findFirst.mockResolvedValue(null);
      mockPrisma.fraudFlag.create.mockResolvedValue({ id: 'flag-99' });

      const decision = await service.evaluatePurchase('buyer-1');
      expect(decision.action).toBe('BLOCK');
    });

    it('dedupes when a PENDING flag for the same rule already exists within 1h', async () => {
      mockPrisma.fraudRule.findFirst.mockResolvedValue(velocityRule);
      mockPrisma.user.findUnique.mockResolvedValue({
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      });
      mockPrisma.order.count.mockResolvedValue(10);
      mockPrisma.fraudFlag.findFirst.mockResolvedValue({ id: 'existing' });

      const decision = await service.evaluatePurchase('buyer-1');
      expect(decision.flagId).toBe('existing');
      // No new row created — dedup path.
      expect(mockPrisma.fraudFlag.create).not.toHaveBeenCalled();
    });

    it('fails open if anything throws (DB hiccup must not block buyers)', async () => {
      mockPrisma.fraudRule.findFirst.mockRejectedValue(new Error('pg down'));

      const decision = await service.evaluatePurchase('buyer-1');
      expect(decision.action).toBe('ALLOW');
    });
  });

  describe('evaluatePayout — PAYOUT_DRAIN', () => {
    const drainRule = {
      code: 'PAYOUT_DRAIN',
      threshold: 1,
      windowMinutes: 60,
      action: 'FLAG',
      description: 'drain',
      enabled: true,
    };

    it('allows through when the method is older than windowMinutes', async () => {
      mockPrisma.fraudRule.findFirst.mockResolvedValue(drainRule);
      mockPrisma.payoutMethod.findUnique.mockResolvedValue({
        userId: 'user-1',
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3h old
      });

      const decision = await service.evaluatePayout('user-1', 'method-1');
      expect(decision.action).toBe('ALLOW');
      expect(mockPrisma.fraudFlag.create).not.toHaveBeenCalled();
    });

    it('flags a payout made within the window of the method being added', async () => {
      mockPrisma.fraudRule.findFirst.mockResolvedValue(drainRule);
      mockPrisma.payoutMethod.findUnique.mockResolvedValue({
        userId: 'user-1',
        createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 min old
      });
      mockPrisma.fraudFlag.findFirst.mockResolvedValue(null);
      mockPrisma.fraudFlag.create.mockResolvedValue({ id: 'flag-drain' });

      const decision = await service.evaluatePayout('user-1', 'method-1');
      expect(decision.action).toBe('FLAG');
      expect(decision.ruleCode).toBe('PAYOUT_DRAIN');
    });

    it('refuses to evaluate when the method belongs to a different user', async () => {
      mockPrisma.fraudRule.findFirst.mockResolvedValue(drainRule);
      mockPrisma.payoutMethod.findUnique.mockResolvedValue({
        userId: 'someone-else',
        createdAt: new Date(),
      });

      const decision = await service.evaluatePayout('user-1', 'method-1');
      expect(decision.action).toBe('ALLOW');
      expect(mockPrisma.fraudFlag.create).not.toHaveBeenCalled();
    });
  });

  describe('resolveFlag', () => {
    it('returns not_found when the flag doesn\'t exist', async () => {
      mockPrisma.fraudFlag.findUnique.mockResolvedValue(null);

      const result = await service.resolveFlag('nope', 'DISMISS', 'admin-1');
      expect(result).toEqual({ resolved: false, reason: 'not_found' });
    });

    it('refuses to resolve an already-resolved flag', async () => {
      mockPrisma.fraudFlag.findUnique.mockResolvedValue({
        id: 'f1',
        status: 'REVIEWED',
      });

      const result = await service.resolveFlag('f1', 'DISMISS', 'admin-1');
      expect(result).toEqual({ resolved: false, reason: 'already_resolved' });
    });

    it('updates status + reviewedById + reviewedAt on DISMISS', async () => {
      mockPrisma.fraudFlag.findUnique.mockResolvedValue({
        id: 'f1',
        status: 'PENDING',
        ruleCode: 'NEW_ACCOUNT_VELOCITY',
      });
      mockPrisma.fraudFlag.update.mockResolvedValue({});

      const result = await service.resolveFlag('f1', 'DISMISS', 'admin-1', 'looked legit');
      expect(result).toEqual({ resolved: true, status: 'DISMISSED' });
      expect(mockPrisma.fraudFlag.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: expect.objectContaining({
          status: 'DISMISSED',
          reviewedById: 'admin-1',
          reviewNote: 'looked legit',
        }),
      });
    });
  });
});
