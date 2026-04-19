import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { MercadoPagoClient } from './mercadopago.client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AnalyticsService } from '../analytics/analytics.service';

const mockMercadoPago = {
  createPixPayment: jest.fn(),
  createCardPayment: jest.fn(),
  createBoletoPayment: jest.fn(),
  verifyWebhookSignature: jest.fn(),
  getPaymentStatus: jest.fn(),
  refundPayment: jest.fn(),
};

const mockPrisma: Record<string, any> = {
  order: {
    update: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn(),
  },
  wallet: {
    upsert: jest.fn(),
    update: jest.fn(),
  },
  walletTransaction: {
    create: jest.fn(),
  },
  processedWebhook: {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue(null),
  },
  paymentFlag: {
    create: jest.fn(),
  },
  user: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  $transaction: jest.fn(),
};
mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma));

function createService(nodeEnv: string): Promise<PaymentsService> {
  return Test.createTestingModule({
    providers: [
      PaymentsService,
      { provide: MercadoPagoClient, useValue: mockMercadoPago },
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string, defaultValue?: string) => {
            if (key === 'NODE_ENV') return nodeEnv;
            return defaultValue ?? '';
          }),
        },
      },
      { provide: PrismaService, useValue: mockPrisma },
      {
        provide: NotificationsService,
        useValue: {
          createNotification: jest.fn(),
          notifyAdmins: jest.fn(),
        },
      },
      { provide: AnalyticsService, useValue: { capture: jest.fn() } },
    ],
  })
    .compile()
    .then((module: TestingModule) =>
      module.get<PaymentsService>(PaymentsService),
    );
}

describe('PaymentsService — Webhook Signature Verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validPayload = {
    action: 'payment.updated',
    data: { id: 'pay-123' },
  };

  // handleWebhook now takes (rawBody, parsedPayload, signature). Tests
  // exercise the in-service branches, not HTTP-layer raw-body capture,
  // so we synthesise a Buffer from the parsed payload. Production code
  // verifies against the wire bytes (see payments.controller).
  const rawOf = (payload: unknown): Buffer =>
    Buffer.from(JSON.stringify(payload));

  describe('production mode (NODE_ENV=production)', () => {
    let service: PaymentsService;

    beforeEach(async () => {
      service = await createService('production');
    });

    it('should reject missing signature in production with 401', async () => {
      await expect(
        service.handleWebhook(rawOf(validPayload), validPayload, undefined),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject invalid signature in production with 401', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(false);

      await expect(
        service.handleWebhook(rawOf(validPayload), validPayload, 'bad-signature'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should accept valid signature in production', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
      mockMercadoPago.getPaymentStatus.mockResolvedValue({
        status: 'approved',
      });

      const raw = rawOf(validPayload);
      const result = await service.handleWebhook(
        raw,
        validPayload,
        'valid-signature',
      );

      expect(result).toEqual({ received: true });
      expect(mockMercadoPago.verifyWebhookSignature).toHaveBeenCalledWith(
        raw,
        'valid-signature',
      );
    });
  });

  describe('development mode (NODE_ENV=development)', () => {
    let service: PaymentsService;

    beforeEach(async () => {
      service = await createService('development');
    });

    it('should still reject missing signature in development mode', async () => {
      await expect(
        service.handleWebhook(rawOf(validPayload), validPayload, undefined),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should still reject invalid signature even in development', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(false);

      await expect(
        service.handleWebhook(rawOf(validPayload), validPayload, 'bad-signature'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should accept valid signature in development', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
      mockMercadoPago.getPaymentStatus.mockResolvedValue({
        status: 'approved',
      });

      const result = await service.handleWebhook(
        rawOf(validPayload),
        validPayload,
        'valid-signature',
      );

      expect(result).toEqual({ received: true });
    });
  });

  describe('payload validation', () => {
    let service: PaymentsService;

    beforeEach(async () => {
      service = await createService('development');
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
    });

    it('should reject payload missing "action" field', async () => {
      const body = { data: { id: 'pay-1' } };
      await expect(
        service.handleWebhook(rawOf(body), body, 'valid-sig'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject payload missing "data" field', async () => {
      const body = { action: 'payment.updated' };
      await expect(
        service.handleWebhook(rawOf(body), body, 'valid-sig'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject completely empty payload', async () => {
      const body = {};
      await expect(
        service.handleWebhook(rawOf(body), body, 'valid-sig'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a well-formed payload when rawBody is missing', async () => {
      // Defence in depth: if the HTTP layer forgot to capture rawBody,
      // handleWebhook must refuse rather than fall back to re-stringify.
      await expect(
        service.handleWebhook(undefined, validPayload, 'valid-sig'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should accept well-formed payload with both action and data', async () => {
      mockMercadoPago.getPaymentStatus.mockResolvedValue({
        status: 'approved',
      });

      const result = await service.handleWebhook(rawOf(validPayload), validPayload, 'valid-sig');

      expect(result).toEqual({ received: true });
    });
  });

  // Dedup guard (P-08 outbox): each delivery id must end up processed
  // AT MOST ONCE. Fast-path hits findUnique before any MP API call; the
  // correctness-critical path commits the ProcessedWebhook row INSIDE
  // the same $transaction as the order / wallet writes. A crash between
  // the two is impossible by construction — they either both land or
  // both roll back.
  describe('dedup (outbox, P-08)', () => {
    let service: PaymentsService;

    beforeEach(async () => {
      jest.clearAllMocks();
      mockPrisma.processedWebhook.create.mockResolvedValue({});
      mockPrisma.processedWebhook.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma));
      service = await createService('production');
    });

    it('records the delivery id on first receipt — INSIDE the outbox transaction', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
      mockMercadoPago.getPaymentStatus.mockResolvedValue({
        status: 'approved',
        transaction_amount: 100,
      });
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        sellerId: 'seller-1',
        buyerId: 'buyer-1',
        status: 'PENDING',
        totalBrl: 100,
        itemPriceBrl: 80,
        listing: { title: 'Jaqueta' },
      });
      mockPrisma.wallet.upsert.mockResolvedValue({ id: 'wallet-1' });
      const body = { id: 'delivery-abc', action: 'payment.updated', data: { id: 'pay-1' } };

      await service.handleWebhook(rawOf(body), body, 'valid-sig');

      // The create call must have fired on the TX handle passed into
      // $transaction — our mock binds tx === mockPrisma, so it's just
      // checking the create was called from inside the tx callback.
      expect(mockPrisma.processedWebhook.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          provider: 'mercadopago',
          externalEventId: 'delivery-abc',
          action: 'payment.updated',
        }),
      });
      // And the transaction callback was invoked exactly once.
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('fast-path: a previously-recorded delivery short-circuits without hitting MP', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
      mockPrisma.processedWebhook.findUnique.mockResolvedValue({ id: 'pw-1' });
      const body = { id: 'delivery-abc', action: 'payment.updated', data: { id: 'pay-1' } };

      const result = await service.handleWebhook(rawOf(body), body, 'valid-sig');

      expect(result).toEqual({ received: true, duplicate: true });
      // Critical: duplicate short-circuit must NOT call MP.
      expect(mockMercadoPago.getPaymentStatus).not.toHaveBeenCalled();
      // Nor may it open a transaction or attempt another insert.
      expect(mockPrisma.processedWebhook.create).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('race: two concurrent deliveries — the loser sees P2002 inside the tx and swallows silently', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
      mockMercadoPago.getPaymentStatus.mockResolvedValue({
        status: 'approved',
        transaction_amount: 100,
      });
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        sellerId: 'seller-1',
        buyerId: 'buyer-1',
        status: 'PENDING',
        totalBrl: 100,
        itemPriceBrl: 80,
        listing: { title: 'Jaqueta' },
      });
      // Both racers pass the fast-path findUnique(null), but when the
      // slower one reaches the create() inside its tx, the faster one
      // has already committed and Prisma raises P2002.
      const p2002 = Object.assign(new Error('unique violation'), { code: 'P2002' });
      mockPrisma.processedWebhook.create.mockRejectedValueOnce(p2002);
      const body = { id: 'delivery-race', action: 'payment.updated', data: { id: 'pay-2' } };

      // Must NOT throw — silent dedup on the loser.
      await expect(
        service.handleWebhook(rawOf(body), body, 'valid-sig'),
      ).resolves.toEqual({ received: true });
      // Critical: the loser's wallet / order writes must NOT hit the DB.
      expect(mockPrisma.order.update).not.toHaveBeenCalled();
      expect(mockPrisma.wallet.update).not.toHaveBeenCalled();
      expect(mockPrisma.walletTransaction.create).not.toHaveBeenCalled();
    });

    it('side-effect failure rolls the dedup row back (next MP retry can re-process cleanly)', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
      mockMercadoPago.getPaymentStatus.mockResolvedValue({
        status: 'approved',
        transaction_amount: 100,
      });
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        sellerId: 'seller-1',
        buyerId: 'buyer-1',
        status: 'PENDING',
        totalBrl: 100,
        itemPriceBrl: 80,
        listing: { title: 'Jaqueta' },
      });
      mockPrisma.wallet.upsert.mockResolvedValue({ id: 'wallet-1' });
      // Simulate a transient DB failure on the order.update step. In
      // production, this rolls back the entire $transaction, INCLUDING
      // the processedWebhook.create — so MP's next retry sees no dedup
      // row and re-processes cleanly. The test mock's $transaction
      // implementation re-throws, which is what we assert.
      mockPrisma.order.update.mockRejectedValueOnce(new Error('connection reset'));
      const body = { id: 'delivery-xyz', action: 'payment.updated', data: { id: 'pay-3' } };

      await expect(
        service.handleWebhook(rawOf(body), body, 'valid-sig'),
      ).rejects.toThrow(/connection reset/);
    });

    it('non-approved payments still record dedup but skip order/wallet writes', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
      mockMercadoPago.getPaymentStatus.mockResolvedValue({ status: 'in_process' });
      const body = { id: 'delivery-pending', action: 'payment.updated', data: { id: 'pay-4' } };

      const result = await service.handleWebhook(rawOf(body), body, 'valid-sig');

      expect(result).toEqual({ received: true });
      // Dedup row written (so MP doesn't retry forever).
      expect(mockPrisma.processedWebhook.create).toHaveBeenCalled();
      // But no order or wallet activity.
      expect(mockPrisma.order.update).not.toHaveBeenCalled();
      expect(mockPrisma.wallet.update).not.toHaveBeenCalled();
    });

    it('rejects a payload without any id (cannot dedup → refuse to process)', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
      const body = { action: 'payment.updated', data: {} };

      await expect(
        service.handleWebhook(rawOf(body), body, 'valid-sig'),
      ).rejects.toThrow(/id ausente/);
      expect(mockPrisma.processedWebhook.create).not.toHaveBeenCalled();
    });

    it('non-payment actions still record a dedup row so MP stops retrying', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
      const body = { id: 'delivery-other', action: 'something.else', data: { id: 'x' } };

      const result = await service.handleWebhook(rawOf(body), body, 'valid-sig');

      expect(result).toEqual({ received: true });
      expect(mockMercadoPago.getPaymentStatus).not.toHaveBeenCalled();
      expect(mockPrisma.processedWebhook.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          externalEventId: 'delivery-other',
          action: 'something.else',
        }),
      });
    });
  });
});
