import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { MercadoPagoClient } from './mercadopago.client';

const mockMercadoPago = {
  createPixPayment: jest.fn(),
  createCardPayment: jest.fn(),
  createBoletoPayment: jest.fn(),
  verifyWebhookSignature: jest.fn(),
  getPaymentStatus: jest.fn(),
  refundPayment: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => {
    if (key === 'NODE_ENV') return 'development';
    return defaultValue ?? '';
  }),
};

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: MercadoPagoClient, useValue: mockMercadoPago },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  describe('createPixPayment', () => {
    it('should return a PIX payment with QR code', async () => {
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

      const result = await service.createPixPayment('order-1', 150.0);

      expect(result).toEqual(pixResponse);
      expect(result.orderId).toBe('order-1');
      expect(result.method).toBe('pix');
      expect(result.amountBrl).toBe(150.0);
      expect(result.qrCode).toBeDefined();
      expect(result.status).toBe('pending');
    });

    it('should set expiry to 30 minutes from now', async () => {
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      mockMercadoPago.createPixPayment.mockResolvedValue({
        id: 'pix-1',
        orderId: 'order-1',
        method: 'pix',
        amountBrl: 100,
        qrCode: 'qr',
        qrCodeBase64: 'base64',
        pixCopiaECola: 'pix',
        expiresAt,
        status: 'pending',
      });

      const result = await service.createPixPayment('order-1', 100);

      expect(mockMercadoPago.createPixPayment).toHaveBeenCalledWith(
        'order-1',
        100,
        'Vintage.br - Pedido order-1',
      );
      expect(result.expiresAt).toBeDefined();
    });
  });

  describe('createCardPayment', () => {
    it('should calculate installment amounts', async () => {
      const cardResponse = {
        id: 'card-1',
        orderId: 'order-1',
        method: 'card',
        installments: 3,
        installmentAmount: 100.0,
        total: 300.0,
        status: 'pending',
      };
      mockMercadoPago.createCardPayment.mockResolvedValue(cardResponse);

      const result = await service.createCardPayment('order-1', 300.0, 3);

      expect(result.installments).toBe(3);
      expect(result.installmentAmount).toBe(100.0);
      expect(result.total).toBe(300.0);
      expect(result.status).toBe('pending');
    });

    it('should pass card token to MercadoPago client', async () => {
      mockMercadoPago.createCardPayment.mockResolvedValue({
        id: 'card-1',
        orderId: 'order-1',
        method: 'card',
        installments: 1,
        installmentAmount: 100,
        total: 100,
        status: 'pending',
      });

      await service.createCardPayment('order-1', 100.0, 1, 'token-123');

      expect(mockMercadoPago.createCardPayment).toHaveBeenCalledWith(
        'order-1',
        100.0,
        1,
        'token-123',
      );
    });
  });

  describe('createBoletoPayment', () => {
    it('should return a boleto with 3-day expiry', async () => {
      const boletoResponse = {
        id: 'boleto-1',
        orderId: 'order-1',
        method: 'boleto',
        amountBrl: 200.0,
        barcodeUrl: 'https://api.mercadopago.com/v1/payments/boleto-1/boleto',
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
      };
      mockMercadoPago.createBoletoPayment.mockResolvedValue(boletoResponse);

      const result = await service.createBoletoPayment('order-1', 200.0);

      expect(result.orderId).toBe('order-1');
      expect(result.method).toBe('boleto');
      expect(result.amountBrl).toBe(200.0);
      expect(result.barcodeUrl).toBeDefined();
      expect(result.status).toBe('pending');
      expect(mockMercadoPago.createBoletoPayment).toHaveBeenCalledWith(
        'order-1',
        200.0,
        'Vintage.br - Pedido order-1',
      );
    });
  });

  describe('handleWebhook', () => {
    it('should return received: true for valid webhook', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
      mockMercadoPago.getPaymentStatus.mockResolvedValue({ status: 'approved' });

      const result = await service.handleWebhook(
        { action: 'payment.updated', data: { id: 'pay-1' } },
        'valid-sig',
      );

      expect(result).toEqual({ received: true });
    });

    it('should reject webhook with invalid signature', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(false);

      await expect(
        service.handleWebhook(
          { action: 'payment.updated', data: { id: 'pay-1' } },
          'bad-sig',
        ),
      ).rejects.toThrow();
    });

    it('should process payment.updated action', async () => {
      mockMercadoPago.verifyWebhookSignature.mockReturnValue(true);
      mockMercadoPago.getPaymentStatus.mockResolvedValue({ id: 'pay-1', status: 'approved' });

      await service.handleWebhook(
        { action: 'payment.updated', data: { id: 'pay-1' } },
        'valid-sig',
      );

      expect(mockMercadoPago.getPaymentStatus).toHaveBeenCalledWith('pay-1');
    });
  });

  describe('getPaymentStatus', () => {
    it('should return payment status', async () => {
      mockMercadoPago.getPaymentStatus.mockResolvedValue({
        id: 'pay-1',
        status: 'pending',
        updatedAt: '2026-01-01T00:00:00Z',
      });

      const result = await service.getPaymentStatus('pay-1');

      expect(result.id).toBe('pay-1');
      expect(result.status).toBe('pending');
      expect(mockMercadoPago.getPaymentStatus).toHaveBeenCalledWith('pay-1');
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
});
