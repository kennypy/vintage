import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/client';
import { PaymentsService } from './payments.service';
import { MercadoPagoClient } from './mercadopago.client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { MetricsService } from '../metrics/metrics.service';
import { FraudService } from '../fraud/fraud.service';

const mockMercadoPago = {
  createPixPayment: jest.fn(),
  createCardPayment: jest.fn(),
  createBoletoPayment: jest.fn(),
  verifyWebhookSignature: jest.fn(),
  getPaymentStatus: jest.fn(),
  refundPayment: jest.fn(),
  // Reconcile primitives: search = discovery, getPaymentDetail = authority.
  searchPaymentsByExternalReference: jest.fn().mockResolvedValue([]),
  getPaymentDetail: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => {
    if (key === 'NODE_ENV') return 'development';
    return defaultValue ?? '';
  }),
};

const mockPrisma: Record<string, any> = {
  order: {
    update: jest.fn(),
    // reserveAttempt locks the order row with updateMany BEFORE deciding
    // whether an attempt is already in flight; count 1 = row exists.
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
  payment: {
    create: jest.fn().mockResolvedValue({ id: 'payment-1' }),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  listing: {
    update: jest.fn(),
  },
  orderListingSnapshot: {
    deleteMany: jest.fn(),
  },
  user: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  $transaction: jest.fn(),
};
// Handle both Prisma transaction forms:
//   - Callback form: $transaction(async (tx) => { ... }) — passes the
//     mocked client through as `tx`.
//   - Batch form: $transaction([promiseA, promiseB]) — finalizeAttempt uses
//     this to atomically update Payment + Order; just resolve the array.
mockPrisma.$transaction.mockImplementation((arg: any) => {
  if (typeof arg === 'function') return arg(mockPrisma);
  if (Array.isArray(arg)) return Promise.all(arg);
  return arg;
});

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: MetricsService, useValue: { authLoginFailed: { inc: jest.fn() }, authLoginLocked: { inc: jest.fn() }, authRefreshReuse: { inc: jest.fn() }, authCsrfRejected: { inc: jest.fn() }, paymentFlagCreated: { inc: jest.fn() }, webhookSignatureRejected: { inc: jest.fn() }, webhookDuplicate: { inc: jest.fn() }, privacyAudit: { inc: jest.fn() }, orderCreate: { observe: jest.fn() } } },
        PaymentsService,
        { provide: MercadoPagoClient, useValue: mockMercadoPago },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: NotificationsService,
          useValue: {
            createNotification: jest.fn(),
            notifyAdmins: jest.fn(),
          },
        },
        { provide: AnalyticsService, useValue: { capture: jest.fn() } },
        {
          provide: FraudService,
          useValue: {
            evaluatePaymentAttempt: jest.fn().mockResolvedValue({ action: 'ALLOW' }),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  const mockOrder = {
    id: 'order-1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    status: 'PENDING',
    totalBrl: new Decimal('150'),
    itemPriceBrl: new Decimal('150'),
  };

  beforeEach(() => {
    // Default: order.findUnique returns a valid PENDING order owned by buyer-1
    mockPrisma.order.findUnique.mockResolvedValue(mockOrder);
    mockPrisma.order.update.mockResolvedValue({});
  });

  describe('createPixPayment', () => {
    it('should return a PIX payment using server-side order amount', async () => {
      const pixResponse = {
        id: 'pix-1',
        orderId: 'order-1',
        method: 'pix',
        amountBrl: 150.0,
        qrCode: '00020126...',
        qrCodeBase64: 'data:image/png;base64,...',
        pixCopiaECola: '00020126...',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        status: 'pending',
      };
      mockMercadoPago.createPixPayment.mockResolvedValue(pixResponse);

      const result = await service.createPixPayment('order-1', 'buyer-1');

      expect(result).toEqual(pixResponse);
      expect(result.status).toBe('pending');
      // The fourth argument is the deterministic attempt number used to
      // derive the idempotency key (C2: app-side dedup against MP).
      expect(mockMercadoPago.createPixPayment).toHaveBeenCalledWith(
        'order-1',
        150,
        'Vintage.br - Pedido order-1',
        1,
      );
    });

    it('should reject if user is not the buyer', async () => {
      await expect(
        service.createPixPayment('order-1', 'attacker-1'),
      ).rejects.toThrow();
    });

    it('R-04: refuses to mint a second MP payment when the order already has one (dual-payment guard)', async () => {
      // Pre-fix, every create{Pix,Card,Boleto} call overwrote
      // order.paymentId and orphaned the previous MP charge. A buyer
      // who generated a PIX then switched to a card could pay BOTH
      // and get double-charged (the card's webhook flipped the order
      // PAID; the PIX payment arrived later and silently no-op'd
      // because its paymentId no longer matched order.paymentId).
      mockPrisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        paymentId: 'pix-already-active',
      });

      await expect(
        service.createPixPayment('order-1', 'buyer-1'),
      ).rejects.toThrow(/Já existe um pagamento em andamento/);
      // Critical: the MP client must NOT be called — we'd create a
      // third charge otherwise.
      expect(mockMercadoPago.createPixPayment).not.toHaveBeenCalled();
    });
  });

  describe('createCardPayment', () => {
    it('should use server-side amount and pass installments', async () => {
      const cardResponse = {
        id: 'card-1',
        orderId: 'order-1',
        method: 'card',
        installments: 3,
        installmentAmount: 50.0,
        total: 150.0,
        status: 'pending',
      };
      mockMercadoPago.createCardPayment.mockResolvedValue(cardResponse);

      const result = await service.createCardPayment('order-1', 'buyer-1', 3);

      expect(result.installments).toBe(3);
      expect(result.status).toBe('pending');
    });

    it('should pass card token to MercadoPago client', async () => {
      mockMercadoPago.createCardPayment.mockResolvedValue({
        id: 'card-1',
        orderId: 'order-1',
        method: 'card',
        installments: 1,
        installmentAmount: 150,
        total: 150,
        status: 'pending',
      });

      await service.createCardPayment('order-1', 'buyer-1', 1, 'token-123');

      expect(mockMercadoPago.createCardPayment).toHaveBeenCalledWith(
        'order-1',
        150,
        1,
        'token-123',
        1,
      );
    });
  });

  describe('createBoletoPayment', () => {
    it('should return a boleto using server-side amount', async () => {
      const boletoResponse = {
        id: 'boleto-1',
        orderId: 'order-1',
        method: 'boleto',
        amountBrl: 150.0,
        barcodeUrl: 'https://api.mercadopago.com/v1/payments/boleto-1/boleto',
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
      };
      mockMercadoPago.createBoletoPayment.mockResolvedValue(boletoResponse);

      const result = await service.createBoletoPayment('order-1', 'buyer-1');

      expect(result.orderId).toBe('order-1');
      expect(result.status).toBe('pending');
      expect(mockMercadoPago.createBoletoPayment).toHaveBeenCalledWith(
        'order-1',
        150,
        'Vintage.br - Pedido order-1',
        1,
      );
    });
  });

  describe('handleWebhook', () => {
    // rawBody is the bytes-on-the-wire used for HMAC verification; we
    // fake it here by re-serialising the parsed payload since the spec
    // exercises the service's branches, not the HTTP layer's rawBody
    // capture (that lives in payments.controller).
    const rawOf = (payload: unknown) => Buffer.from(JSON.stringify(payload));

    it('should return received: true for valid webhook', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
      mockMercadoPago.getPaymentStatus.mockResolvedValue({ status: 'approved' });
      const body = { action: 'payment.updated', data: { id: 'pay-1' } };

      const result = await service.handleWebhook(rawOf(body), body, 'valid-sig');

      expect(result).toEqual({ received: true });
    });

    it('should reject webhook with invalid signature', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(false);
      const body = { action: 'payment.updated', data: { id: 'pay-1' } };

      await expect(
        service.handleWebhook(rawOf(body), body, 'bad-sig'),
      ).rejects.toThrow();
    });

    it('should process payment.updated action', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
      mockMercadoPago.getPaymentStatus.mockResolvedValue({ id: 'pay-1', status: 'approved' });
      const body = { action: 'payment.updated', data: { id: 'pay-1' } };

      await service.handleWebhook(rawOf(body), body, 'valid-sig');

      expect(mockMercadoPago.getPaymentStatus).toHaveBeenCalledWith('pay-1');
    });
  });

  describe('getPaymentStatus', () => {
    it('returns payment status when the caller is the buyer OR seller on that order (H5)', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({ id: 'order-1' });
      mockMercadoPago.getPaymentStatus.mockResolvedValue({
        id: 'pay-1',
        status: 'pending',
        updatedAt: '2026-01-01T00:00:00Z',
      });

      const result = await service.getPaymentStatus('pay-1', 'user-buyer');

      // H5: sellers also need to see payment status to know whether the
      // funds have arrived before shipping. The OR clause keeps the
      // ownership oracle behaviour while widening access to both parties.
      expect(mockPrisma.order.findFirst).toHaveBeenCalledWith({
        where: {
          paymentId: 'pay-1',
          OR: [{ buyerId: 'user-buyer' }, { sellerId: 'user-buyer' }],
        },
        select: { id: true },
      });
      expect(result.id).toBe('pay-1');
      expect(mockMercadoPago.getPaymentStatus).toHaveBeenCalledWith('pay-1');
    });

    it('rejects as NotFound when the caller is not the buyer on that order (R-06)', async () => {
      // The old code proxied any paymentId straight to MP, letting an
      // authenticated user read another buyer's payment status.
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(service.getPaymentStatus('pay-1', 'nosy-user')).rejects.toThrow(
        /não encontrado/i,
      );
      expect(mockMercadoPago.getPaymentStatus).not.toHaveBeenCalled();
    });

    it('rejects obviously malformed paymentIds without hitting the DB', async () => {
      await expect(service.getPaymentStatus('', 'user-1')).rejects.toThrow(
        /inválido/,
      );
      await expect(
        service.getPaymentStatus('x'.repeat(200), 'user-1'),
      ).rejects.toThrow(/inválido/);
      expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('refundPayment', () => {
    it('should return refund details', async () => {
      mockMercadoPago.refundPayment.mockResolvedValue({
        id: 'refund-1',
        paymentId: 'pay-1',
        amountBrl: 100.0,
        status: 'refunded',
        refundedAt: '2026-01-01T00:00:00Z',
      });

      const result = await service.refundPayment('pay-1', 100.0);

      expect(result.paymentId).toBe('pay-1');
      expect(result.amountBrl).toBe(100.0);
      expect(result.status).toBe('refunded');
    });

    it('should pass undefined amount for full refund', async () => {
      mockMercadoPago.refundPayment.mockResolvedValue({
        id: 'refund-1',
        paymentId: 'pay-1',
        amountBrl: 0,
        status: 'refunded',
        refundedAt: '2026-01-01T00:00:00Z',
      });

      await service.refundPayment('pay-1');

      expect(mockMercadoPago.refundPayment).toHaveBeenCalledWith('pay-1', undefined);
    });
  });

  // ── F17: at most ONE live instrument per order ────────────────────────
  //
  // These assert the INVARIANT, not the stall window or key equality.
  // Safety comes from never speculatively minting: a stalled reservation
  // triggers reconciliation against MP, and only a provably-dead result
  // clears the way to create a new instrument.
  describe('F17 — reconcile before mint', () => {
    const ORDER = 'order-1';
    const BUYER = 'buyer-1';

    /** A stalled reservation exists; nothing else is in flight. */
    const withStalledReservation = () => {
      mockPrisma.payment.count.mockImplementation(({ where }: any) => {
        // reconcileBeforeMint: PENDING with no providerPaymentId
        if (where?.providerPaymentId === null) return Promise.resolve(1);
        // reserveAttempt in-flight gate
        if (where?.status === 'PENDING') return Promise.resolve(0);
        // attemptNumber
        return Promise.resolve(0);
      });
      mockPrisma.order.findUnique.mockResolvedValue({
        id: ORDER,
        buyerId: BUYER,
        status: 'PENDING',
        paymentId: null,
        totalBrl: new Decimal(100),
      });
      mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.payment.findFirst.mockResolvedValue({ id: 'payment-stalled' });
      mockPrisma.payment.create.mockResolvedValue({ id: 'payment-new' });
    };

    const detail = (over: Record<string, unknown> = {}) => ({
      id: 'mp-existing',
      status: 'pending',
      statusDetail: 'pending_waiting_transfer',
      externalReference: ORDER,
      amountBrl: 100,
      qrCode: 'QR-CODE-STRING',
      qrCodeBase64: 'BASE64',
      expiresAt: '2026-07-24T20:00:00.000+00:00',
      ...over,
    });

    it('a timed-out-then-reconciled attempt yields at most one live instrument', async () => {
      withStalledReservation();
      // The provider DID create an instrument before we stopped waiting.
      mockMercadoPago.searchPaymentsByExternalReference.mockResolvedValue([
        { id: 'mp-existing', status: 'pending', statusDetail: null },
      ]);
      mockMercadoPago.getPaymentDetail.mockResolvedValue(detail());

      const result = await service.createPixPayment(ORDER, BUYER);

      // The invariant: no second instrument was minted.
      expect(mockMercadoPago.createPixPayment).not.toHaveBeenCalled();
      expect(result.id).toBe('mp-existing');
      // Authority was consulted, not just the eventually-consistent index.
      expect(mockMercadoPago.getPaymentDetail).toHaveBeenCalledWith('mp-existing');
    });

    it('live instrument found → zero new POSTs, existing one adopted', async () => {
      withStalledReservation();
      mockMercadoPago.searchPaymentsByExternalReference.mockResolvedValue([
        { id: 'mp-existing', status: 'in_process', statusDetail: null },
      ]);
      mockMercadoPago.getPaymentDetail.mockResolvedValue(
        detail({ status: 'in_process' }),
      );

      const result = await service.createPixPayment(ORDER, BUYER);

      expect(mockMercadoPago.createPixPayment).toHaveBeenCalledTimes(0);
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
      expect(result.qrCode).toBe('QR-CODE-STRING');
    });

    it('an approved instrument is adopted too — never minted over', async () => {
      withStalledReservation();
      mockMercadoPago.searchPaymentsByExternalReference.mockResolvedValue([
        { id: 'mp-existing', status: 'approved', statusDetail: 'accredited' },
      ]);
      mockMercadoPago.getPaymentDetail.mockResolvedValue(
        detail({ status: 'approved', statusDetail: 'accredited' }),
      );

      await service.createPixPayment(ORDER, BUYER);

      expect(mockMercadoPago.createPixPayment).not.toHaveBeenCalled();
    });

    it('all instruments failure-terminal → exactly one new POST (expiry re-pay)', async () => {
      withStalledReservation();
      // Expired PIX: status cancelled + status_detail expired.
      mockMercadoPago.searchPaymentsByExternalReference.mockResolvedValue([
        { id: 'mp-dead', status: 'cancelled', statusDetail: 'expired' },
      ]);
      mockMercadoPago.getPaymentDetail.mockResolvedValue(
        detail({ id: 'mp-dead', status: 'cancelled', statusDetail: 'expired' }),
      );
      mockMercadoPago.createPixPayment.mockResolvedValue({
        id: 'mp-fresh',
        orderId: ORDER,
        method: 'pix',
        amountBrl: 100,
        qrCode: 'NEW-QR',
        qrCodeBase64: '',
        pixCopiaECola: 'NEW-QR',
        expiresAt: '2026-07-24T21:00:00.000+00:00',
        status: 'pending',
      });

      const result = await service.createPixPayment(ORDER, BUYER);

      expect(mockMercadoPago.createPixPayment).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('mp-fresh');
    });

    it('empty search is AMBIGUOUS → HOLD, never mint', async () => {
      withStalledReservation();
      // Eventually-consistent index: empty != no instrument.
      mockMercadoPago.searchPaymentsByExternalReference.mockResolvedValue([]);

      await expect(service.createPixPayment(ORDER, BUYER)).rejects.toThrow(
        /não foi possível confirmar/i,
      );
      expect(mockMercadoPago.createPixPayment).not.toHaveBeenCalled();
    });

    it('a status outside the known Payments-API sets → HOLD, never mint', async () => {
      withStalledReservation();
      mockMercadoPago.searchPaymentsByExternalReference.mockResolvedValue([
        { id: 'mp-weird', status: 'expired', statusDetail: null },
      ]);
      // `expired` is an ORDERS-API status; it must not classify as terminal.
      mockMercadoPago.getPaymentDetail.mockResolvedValue(
        detail({ id: 'mp-weird', status: 'expired' }),
      );

      await expect(service.createPixPayment(ORDER, BUYER)).rejects.toThrow(
        /não foi possível confirmar/i,
      );
      expect(mockMercadoPago.createPixPayment).not.toHaveBeenCalled();
    });

    it('no stalled reservation → reconcile is skipped entirely', async () => {
      withStalledReservation();
      mockPrisma.payment.count.mockImplementation(({ where }: any) => {
        if (where?.providerPaymentId === null) return Promise.resolve(0);
        if (where?.status === 'PENDING') return Promise.resolve(0);
        return Promise.resolve(0);
      });
      mockMercadoPago.createPixPayment.mockResolvedValue({
        id: 'mp-first', orderId: ORDER, method: 'pix', amountBrl: 100,
        qrCode: 'Q', qrCodeBase64: '', pixCopiaECola: 'Q',
        expiresAt: '', status: 'pending',
      });

      await service.createPixPayment(ORDER, BUYER);

      expect(mockMercadoPago.searchPaymentsByExternalReference).not.toHaveBeenCalled();
      expect(mockMercadoPago.createPixPayment).toHaveBeenCalledTimes(1);
    });

    describe('regenerate (expiry re-pay)', () => {
      it('against a LIVE instrument → zero new POSTs, returns existing', async () => {
        withStalledReservation();
        mockMercadoPago.searchPaymentsByExternalReference.mockResolvedValue([
          { id: 'mp-existing', status: 'pending', statusDetail: null },
        ]);
        mockMercadoPago.getPaymentDetail.mockResolvedValue(detail());

        const result = await service.regeneratePixPayment(ORDER, BUYER);

        // A regenerate button that mints without reconciling IS the
        // double-charge this whole unit exists to prevent.
        expect(mockMercadoPago.createPixPayment).not.toHaveBeenCalled();
        expect(result.id).toBe('mp-existing');
        expect(result.qrCode).toBe('QR-CODE-STRING');
      });

      it('against an EXPIRED instrument → exactly one new POST', async () => {
        withStalledReservation();
        mockMercadoPago.searchPaymentsByExternalReference.mockResolvedValue([
          { id: 'mp-dead', status: 'cancelled', statusDetail: 'expired' },
        ]);
        mockMercadoPago.getPaymentDetail.mockResolvedValue(
          detail({ id: 'mp-dead', status: 'cancelled', statusDetail: 'expired' }),
        );
        mockMercadoPago.createPixPayment.mockResolvedValue({
          id: 'mp-fresh', orderId: ORDER, method: 'pix', amountBrl: 100,
          qrCode: 'NEW-QR', qrCodeBase64: '', pixCopiaECola: 'NEW-QR',
          expiresAt: '', status: 'pending',
        });

        const result = await service.regeneratePixPayment(ORDER, BUYER);

        expect(mockMercadoPago.createPixPayment).toHaveBeenCalledTimes(1);
        expect(result.id).toBe('mp-fresh');
      });

      it('refuses when another buyer asks', async () => {
        withStalledReservation();
        await expect(
          service.regeneratePixPayment(ORDER, 'someone-else'),
        ).rejects.toThrow(/acesso negado/i);
        expect(mockMercadoPago.createPixPayment).not.toHaveBeenCalled();
      });
    });
  });
});
