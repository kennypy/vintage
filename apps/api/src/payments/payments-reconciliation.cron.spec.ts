import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsReconciliationCron } from './payments-reconciliation.cron';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { CronLockService } from '../common/services/cron-lock.service';

describe('PaymentsReconciliationCron', () => {
  let cron: PaymentsReconciliationCron;
  const mockPrisma = {
    payment: {
      findMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const mockPayments = {
    reconcilePayment: jest.fn(),
  };
  const mockCronLock = {
    acquire: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCronLock.acquire.mockResolvedValue(true);
    mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsReconciliationCron,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaymentsService, useValue: mockPayments },
        { provide: CronLockService, useValue: mockCronLock },
      ],
    }).compile();

    cron = moduleRef.get(PaymentsReconciliationCron);
  });

  it('bails without querying when the cron lock is not acquired', async () => {
    mockCronLock.acquire.mockResolvedValue(false);

    await cron.reconcilePendingPayments();

    expect(mockPrisma.payment.findMany).not.toHaveBeenCalled();
    expect(mockPayments.reconcilePayment).not.toHaveBeenCalled();
  });

  it('only sweeps PENDING payments with a providerPaymentId older than the grace window', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([]);

    await cron.reconcilePendingPayments();

    const where = mockPrisma.payment.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('PENDING');
    expect(where.providerPaymentId).toEqual({ not: null });
    expect(where.createdAt.lt).toBeInstanceOf(Date);
    // 15-minute grace window (with a little slack for test execution time).
    const ageMs = Date.now() - where.createdAt.lt.getTime();
    expect(ageMs).toBeGreaterThanOrEqual(15 * 60 * 1000 - 1000);
    expect(ageMs).toBeLessThan(16 * 60 * 1000);
  });

  it('settles an approved payment without touching the Payment row (settlement path owns it)', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([
      { id: 'pay-1', providerPaymentId: 'mp-1' },
    ]);
    mockPayments.reconcilePayment.mockResolvedValue('approved');

    await cron.reconcilePendingPayments();

    expect(mockPayments.reconcilePayment).toHaveBeenCalledWith('mp-1');
    // The settlement transaction marks the Payment SUCCEEDED itself; the
    // cron must NOT also write to the row.
    expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it('marks a terminally-failed payment FAILED, guarded on still-PENDING', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([
      { id: 'pay-2', providerPaymentId: 'mp-2' },
    ]);
    mockPayments.reconcilePayment.mockResolvedValue('failed');

    await cron.reconcilePendingPayments();

    expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay-2', status: 'PENDING' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
  });

  it('leaves a still-in-flight payment untouched', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([
      { id: 'pay-3', providerPaymentId: 'mp-3' },
    ]);
    mockPayments.reconcilePayment.mockResolvedValue('pending');

    await cron.reconcilePendingPayments();

    expect(mockPrisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it('isolates failures so one bad payment does not abort the batch', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([
      { id: 'pay-a', providerPaymentId: 'mp-a' },
      { id: 'pay-b', providerPaymentId: 'mp-b' },
    ]);
    mockPayments.reconcilePayment
      .mockRejectedValueOnce(new Error('MP 500'))
      .mockResolvedValueOnce('failed');

    await cron.reconcilePendingPayments();

    // Both payments were attempted despite the first throwing.
    expect(mockPayments.reconcilePayment).toHaveBeenCalledTimes(2);
    expect(mockPrisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay-b', status: 'PENDING' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
  });
});
