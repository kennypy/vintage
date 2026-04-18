import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { MercadoPagoClient } from './mercadopago.client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

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

  describe('production mode (NODE_ENV=production)', () => {
    let service: PaymentsService;

    beforeEach(async () => {
      service = await createService('production');
    });

    it('should reject missing signature in production with 401', async () => {
      await expect(
        service.handleWebhook(validPayload, undefined),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject invalid signature in production with 401', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(false);

      await expect(
        service.handleWebhook(validPayload, 'bad-signature'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should accept valid signature in production', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
      mockMercadoPago.getPaymentStatus.mockResolvedValue({
        status: 'approved',
      });

      const result = await service.handleWebhook(
        validPayload,
        'valid-signature',
      );

      expect(result).toEqual({ received: true });
      expect(mockMercadoPago.verifyWebhookSignature).toHaveBeenCalledWith(
        JSON.stringify(validPayload),
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
        service.handleWebhook(validPayload, undefined),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should still reject invalid signature even in development', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(false);

      await expect(
        service.handleWebhook(validPayload, 'bad-signature'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should accept valid signature in development', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
      mockMercadoPago.getPaymentStatus.mockResolvedValue({
        status: 'approved',
      });

      const result = await service.handleWebhook(
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
      await expect(
        service.handleWebhook({ data: { id: 'pay-1' } }, 'valid-sig'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject payload missing "data" field', async () => {
      await expect(
        service.handleWebhook(
          { action: 'payment.updated' },
          'valid-sig',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject completely empty payload', async () => {
      await expect(service.handleWebhook({}, 'valid-sig')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should accept well-formed payload with both action and data', async () => {
      mockMercadoPago.getPaymentStatus.mockResolvedValue({
        status: 'approved',
      });

      const result = await service.handleWebhook(validPayload, 'valid-sig');

      expect(result).toEqual({ received: true });
    });
  });

  // Dedup guard: a given webhook delivery is identified by payload.id
  // (MP assigns one per retry). The first delivery inserts a row into
  // ProcessedWebhook; a redelivery trips the UNIQUE constraint on
  // (provider, externalEventId) and must return 200 WITHOUT re-running
  // any side effects.
  describe('dedup (#6)', () => {
    let service: PaymentsService;

    beforeEach(async () => {
      jest.clearAllMocks();
      mockPrisma.processedWebhook.create.mockResolvedValue({});
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma));
      service = await createService('production');
    });

    it('records the delivery id on first receipt', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
      mockMercadoPago.getPaymentStatus.mockResolvedValue({ status: 'approved' });

      await service.handleWebhook(
        { id: 'delivery-abc', action: 'payment.updated', data: { id: 'pay-1' } },
        'valid-sig',
      );

      expect(mockPrisma.processedWebhook.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          provider: 'mercadopago',
          externalEventId: 'delivery-abc',
          action: 'payment.updated',
        }),
      });
    });

    it('returns { duplicate: true } on a redelivery (P2002) WITHOUT re-processing', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
      const p2002 = Object.assign(new Error('unique violation'), { code: 'P2002' });
      mockPrisma.processedWebhook.create.mockRejectedValueOnce(p2002);

      const result = await service.handleWebhook(
        { id: 'delivery-abc', action: 'payment.updated', data: { id: 'pay-1' } },
        'valid-sig',
      );

      expect(result).toEqual({ received: true, duplicate: true });
      // Critical: the payment status fetch + processApprovedPayment
      // must NOT run on a duplicate. Otherwise we double-credit escrow.
      expect(mockMercadoPago.getPaymentStatus).not.toHaveBeenCalled();
    });

    it('rejects a payload without any id (cannot dedup → refuse to process)', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);

      await expect(
        service.handleWebhook(
          { action: 'payment.updated', data: {} },
          'valid-sig',
        ),
      ).rejects.toThrow(/id ausente/);
      expect(mockPrisma.processedWebhook.create).not.toHaveBeenCalled();
    });
  });
});
