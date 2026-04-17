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

    it('should accept missing signature in development mode', async () => {
      mockMercadoPago.getPaymentStatus.mockResolvedValue({
        status: 'approved',
      });

      const result = await service.handleWebhook(validPayload, undefined);

      expect(result).toEqual({ received: true });
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
    });

    it('should reject payload missing "action" field', async () => {
      await expect(
        service.handleWebhook({ data: { id: 'pay-1' } }, undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject payload missing "data" field', async () => {
      await expect(
        service.handleWebhook(
          { action: 'payment.updated' },
          undefined,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject completely empty payload', async () => {
      await expect(service.handleWebhook({}, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should accept well-formed payload with both action and data', async () => {
      mockMercadoPago.getPaymentStatus.mockResolvedValue({
        status: 'approved',
      });

      const result = await service.handleWebhook(validPayload, undefined);

      expect(result).toEqual({ received: true });
    });
  });
});
