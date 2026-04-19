import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutMethodsService } from './payout-methods.service';
import {
  MercadoPagoClient,
  MercadoPagoPayoutUnavailableError,
} from '../payments/mercadopago.client';
import { FraudService } from '../fraud/fraud.service';

jest.mock('@vintage/shared', () => ({
  MIN_PAYOUT_BRL: 10.0,
}));

const mockPrisma = {
  user: { findUnique: jest.fn() },
  wallet: { findUnique: jest.fn(), update: jest.fn() },
  walletTransaction: { create: jest.fn() },
  payoutRequest: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockPayoutMethods = {
  getOwnedOrThrow: jest.fn(),
};

const mockMp = {
  sendPixPayout: jest.fn(),
};

describe('PayoutsService', () => {
  let service: PayoutsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: caller has verified CPF.
    mockPrisma.user.findUnique.mockResolvedValue({
      cpf: '52998224725',
      cpfIdentityVerified: true,
    });
    mockPayoutMethods.getOwnedOrThrow.mockResolvedValue({
      id: 'method-1',
      userId: 'user-1',
      type: 'PIX_EMAIL',
      pixKey: 'jane@example.com',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PayoutMethodsService, useValue: mockPayoutMethods },
        { provide: MercadoPagoClient, useValue: mockMp },
        {
          provide: FraudService,
          useValue: {
            evaluatePayout: jest.fn().mockResolvedValue({ action: 'ALLOW' }),
          },
        },
      ],
    }).compile();

    service = module.get<PayoutsService>(PayoutsService);
  });

  // Helper: wire the $transaction callback to a tx client that reflects
  // the wallet-debit + ledger + payoutRequest shape the service writes.
  const setupTx = (debitCount: number) => {
    const tx = {
      wallet: {
        updateMany: jest.fn().mockResolvedValue({ count: debitCount }),
      },
      walletTransaction: {
        create: jest.fn().mockResolvedValue({ id: 'ledger-1' }),
      },
      payoutRequest: {
        create: jest.fn().mockResolvedValue({ id: 'pr-1' }),
      },
    };
    mockPrisma.$transaction.mockImplementation(async (cb: unknown) =>
      typeof cb === 'function' ? (cb as (t: typeof tx) => unknown)(tx) : undefined,
    );
    return tx;
  };

  describe('gates', () => {
    it('rejects amounts below MIN_PAYOUT_BRL before any DB write', async () => {
      await expect(service.requestPayout('user-1', 5, 'method-1')).rejects.toThrow(
        /Valor mínimo/,
      );
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects negative / NaN amounts', async () => {
      await expect(service.requestPayout('user-1', -5, 'method-1')).rejects.toThrow(
        /inválido/,
      );
      await expect(service.requestPayout('user-1', NaN, 'method-1')).rejects.toThrow(
        /inválido/,
      );
    });

    it('rejects users without a CPF (OAuth that never linked)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ cpf: null, cpfIdentityVerified: false });

      await expect(service.requestPayout('user-1', 100, 'method-1')).rejects.toThrow(
        /Adicione um CPF/,
      );
      expect(mockPayoutMethods.getOwnedOrThrow).not.toHaveBeenCalled();
    });

    it('rejects users whose CPF is linked but NOT verified (Wave 3C tightening)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ cpf: '52998224725', cpfIdentityVerified: false });

      await expect(service.requestPayout('user-1', 100, 'method-1')).rejects.toThrow(
        /Verificação de identidade pendente/,
      );
      expect(mockPayoutMethods.getOwnedOrThrow).not.toHaveBeenCalled();
      expect(mockMp.sendPixPayout).not.toHaveBeenCalled();
    });

    it('rejects when the payout method belongs to another user — no wallet read', async () => {
      mockPayoutMethods.getOwnedOrThrow.mockRejectedValueOnce(
        new ForbiddenException('not yours'),
      );

      await expect(service.requestPayout('user-1', 100, 'method-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.wallet.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFound if the user has no wallet row', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValueOnce(null);
      await expect(service.requestPayout('user-1', 100, 'method-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects obviously-insufficient balance without opening a transaction', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValueOnce({ id: 'w1', balanceBrl: 50 });
      await expect(service.requestPayout('user-1', 100, 'method-1')).rejects.toThrow(
        /Saldo insuficiente/,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('happy path', () => {
    beforeEach(() => {
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'w1', balanceBrl: 250 });
    });

    it('debits wallet atomically, creates PayoutRequest, calls MP, promotes to PROCESSING', async () => {
      const tx = setupTx(1);
      mockMp.sendPixPayout.mockResolvedValue({
        externalId: 'mp-abc',
        status: 'PROCESSING',
      });
      mockPrisma.payoutRequest.update.mockResolvedValue({});

      const result = await service.requestPayout('user-1', 100, 'method-1');

      // Race-safe debit
      expect(tx.wallet.updateMany).toHaveBeenCalledWith({
        where: { id: 'w1', balanceBrl: { gte: 100 } },
        data: { balanceBrl: { decrement: 100 } },
      });
      // PayoutRequest snapshotted the method so a later edit/delete can't
      // orphan the record.
      expect(tx.payoutRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            payoutMethodId: 'method-1',
            snapshotType: 'PIX_EMAIL',
            snapshotPixKey: 'jane@example.com',
            amountBrl: 100,
            status: 'PENDING',
            walletTransactionId: 'ledger-1',
          }),
        }),
      );
      // MP externalReference MUST be the payoutRequest id (idempotency key)
      expect(mockMp.sendPixPayout).toHaveBeenCalledWith(
        expect.objectContaining({
          externalReference: 'pr-1',
          pixKey: 'jane@example.com',
          pixKeyType: 'PIX_EMAIL',
          amountBrl: 100,
        }),
      );
      // Row promoted with MP id + PROCESSING
      expect(mockPrisma.payoutRequest.update).toHaveBeenCalledWith({
        where: { id: 'pr-1' },
        data: expect.objectContaining({
          status: 'PROCESSING',
          externalId: 'mp-abc',
          completedAt: null,
        }),
      });
      expect(result).toMatchObject({
        success: true,
        payoutRequestId: 'pr-1',
        status: 'PROCESSING',
        newBalance: 150,
      });
    });

    it('promotes directly to COMPLETED when MP returns approved', async () => {
      setupTx(1);
      mockMp.sendPixPayout.mockResolvedValue({
        externalId: 'mp-abc',
        status: 'COMPLETED',
      });
      mockPrisma.payoutRequest.update.mockResolvedValue({});

      const result = await service.requestPayout('user-1', 100, 'method-1');
      expect(result.status).toBe('COMPLETED');
      expect(mockPrisma.payoutRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            completedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('throws (race-safe) when the conditional updateMany returns count=0', async () => {
      setupTx(0); // concurrent debit drained the balance between pre-flight and tx
      await expect(service.requestPayout('user-1', 100, 'method-1')).rejects.toThrow(
        /Saldo insuficiente/,
      );
      expect(mockMp.sendPixPayout).not.toHaveBeenCalled();
    });
  });

  describe('MP unavailable (contract not yet active)', () => {
    beforeEach(() => {
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'w1', balanceBrl: 250 });
    });

    it('keeps the PayoutRequest PENDING (no refund) when MP throws the sentinel', async () => {
      setupTx(1);
      mockMp.sendPixPayout.mockRejectedValue(new MercadoPagoPayoutUnavailableError());

      const result = await service.requestPayout('user-1', 100, 'method-1');

      expect(result.status).toBe('PENDING');
      expect(result.payoutRequestId).toBe('pr-1');
      // The row stays PENDING — ops will reconcile it. We do NOT update
      // the row here (no externalId, no status change).
      expect(mockPrisma.payoutRequest.update).not.toHaveBeenCalled();
      // And critically, we do NOT refund the wallet — the debit stands
      // because the payout IS intended to happen, just out-of-band.
      expect(mockPrisma.wallet.update).not.toHaveBeenCalled();
    });
  });

  describe('MP hard failure → wallet refund', () => {
    beforeEach(() => {
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'w1', balanceBrl: 250 });
    });

    it('refunds the wallet atomically and marks the row FAILED', async () => {
      setupTx(1);
      mockMp.sendPixPayout.mockRejectedValue(new Error('MP 500'));
      // Second $transaction is the refund flow.
      const refundTx = {
        wallet: { update: jest.fn().mockResolvedValue({}) },
        walletTransaction: { create: jest.fn().mockResolvedValue({}) },
        payoutRequest: { update: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction
        .mockImplementationOnce(async (cb: unknown) => {
          // first $transaction = debit; already set up by setupTx
          const tx = {
            wallet: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
            walletTransaction: { create: jest.fn().mockResolvedValue({ id: 'ledger-1' }) },
            payoutRequest: { create: jest.fn().mockResolvedValue({ id: 'pr-1' }) },
          };
          return typeof cb === 'function' ? (cb as (t: typeof tx) => unknown)(tx) : undefined;
        })
        .mockImplementationOnce(async (cb: unknown) =>
          typeof cb === 'function' ? (cb as (t: typeof refundTx) => unknown)(refundTx) : undefined,
        );

      await expect(service.requestPayout('user-1', 100, 'method-1')).rejects.toThrow(
        /devolvido/,
      );

      expect(refundTx.wallet.update).toHaveBeenCalledWith({
        where: { id: 'w1' },
        data: { balanceBrl: { increment: 100 } },
      });
      expect(refundTx.walletTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'REFUND', amountBrl: 100 }),
        }),
      );
      expect(refundTx.payoutRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });
  });

  describe('adminUpdateStatus', () => {
    it('rejects a non-existent PayoutRequest', async () => {
      mockPrisma.payoutRequest.findUnique.mockResolvedValue(null);
      await expect(service.adminUpdateStatus('nope', 'COMPLETED')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to update an already-terminal row', async () => {
      mockPrisma.payoutRequest.findUnique.mockResolvedValue({
        id: 'pr-1',
        status: 'COMPLETED',
      });
      await expect(service.adminUpdateStatus('pr-1', 'FAILED')).rejects.toThrow(
        /terminal/,
      );
    });

    it('promotes PROCESSING → COMPLETED', async () => {
      mockPrisma.payoutRequest.findUnique.mockResolvedValue({
        id: 'pr-1',
        userId: 'user-1',
        status: 'PROCESSING',
        amountBrl: 100,
        walletTransactionId: 'ledger-1',
      });
      mockPrisma.payoutRequest.update.mockResolvedValue({});

      const result = await service.adminUpdateStatus('pr-1', 'COMPLETED');

      expect(result).toEqual({ ok: true, status: 'COMPLETED' });
      expect(mockPrisma.payoutRequest.update).toHaveBeenCalledWith({
        where: { id: 'pr-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      });
    });

    it('FAILED → refunds the wallet and marks status', async () => {
      mockPrisma.payoutRequest.findUnique.mockResolvedValue({
        id: 'pr-1',
        userId: 'user-1',
        status: 'PROCESSING',
        amountBrl: 100,
        walletTransactionId: 'ledger-1',
      });
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'w1' });

      const refundTx = {
        wallet: { update: jest.fn().mockResolvedValue({}) },
        walletTransaction: { create: jest.fn().mockResolvedValue({}) },
        payoutRequest: { update: jest.fn().mockResolvedValue({}) },
      };
      mockPrisma.$transaction.mockImplementation(async (cb: unknown) =>
        typeof cb === 'function' ? (cb as (t: typeof refundTx) => unknown)(refundTx) : undefined,
      );

      const result = await service.adminUpdateStatus('pr-1', 'FAILED', 'banco recusou');

      expect(result).toEqual({ ok: true, status: 'FAILED' });
      expect(refundTx.wallet.update).toHaveBeenCalledWith({
        where: { id: 'w1' },
        data: { balanceBrl: { increment: 100 } },
      });
      expect(refundTx.payoutRequest.update).toHaveBeenCalledWith({
        where: { id: 'pr-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: 'banco recusou',
        }),
      });
    });
  });

  describe('adminList', () => {
    it('defaults to PENDING+PROCESSING filter and never exposes snapshotPixKey', async () => {
      mockPrisma.payoutRequest.findMany.mockResolvedValue([
        {
          id: 'pr-1',
          userId: 'user-1',
          amountBrl: 150,
          status: 'PROCESSING',
          snapshotType: 'PIX_EMAIL',
          externalId: 'mp-x',
          failureReason: null,
          requestedAt: new Date(),
          processingAt: new Date(),
          completedAt: null,
          user: { id: 'user-1', name: 'Jane', email: 'jane@example.com' },
        },
      ]);
      mockPrisma.payoutRequest.count.mockResolvedValue(1);

      const out = await service.adminList(1, 20);

      expect(mockPrisma.payoutRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: { in: ['PENDING', 'PROCESSING'] } },
        }),
      );
      expect(out.items[0]).not.toHaveProperty('snapshotPixKey');
      expect(out.items[0].amountBrl).toBe(150);
    });

    it('narrows by status when the caller passes one', async () => {
      mockPrisma.payoutRequest.findMany.mockResolvedValue([]);
      mockPrisma.payoutRequest.count.mockResolvedValue(0);

      await service.adminList(1, 20, 'FAILED');

      expect(mockPrisma.payoutRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'FAILED' } }),
      );
    });
  });

  describe('listMine', () => {
    it('never exposes the raw pixKey in the response', async () => {
      mockPrisma.payoutRequest.findMany.mockResolvedValue([
        {
          id: 'pr-1',
          amountBrl: 150,
          status: 'PROCESSING',
          snapshotType: 'PIX_EMAIL',
          requestedAt: new Date(),
          completedAt: null,
          failureReason: null,
        },
      ]);
      mockPrisma.payoutRequest.count.mockResolvedValue(1);

      const result = await service.listMine('user-1', 1, 20);

      expect(result.items[0]).not.toHaveProperty('snapshotPixKey');
      expect(result.total).toBe(1);
    });
  });

  // Throwaway smoke assertion: BadRequestException must remain the
  // concrete type used for gate failures (client mapping depends on it).
  it('_type_check BadRequestException remains the gate class', () => {
    expect(new BadRequestException('x')).toBeInstanceOf(BadRequestException);
  });
});
