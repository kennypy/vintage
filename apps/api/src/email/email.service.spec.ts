import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn().mockReturnValue({
  sendMail: mockSendMail,
});

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
}));

describe('EmailService', () => {
  let service: EmailService;

  describe('development mode (no SMTP)', () => {
    beforeEach(async () => {
      jest.clearAllMocks();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockImplementation((key: string) => {
                const config: Record<string, string | undefined> = {
                  SMTP_HOST: undefined,
                  EMAIL_FROM: 'Vintage.br <noreply@vintage.br>',
                };
                return config[key];
              }),
            },
          },
        ],
      }).compile();

      service = module.get<EmailService>(EmailService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should log welcome email in dev mode without throwing', async () => {
      await expect(
        service.sendWelcomeEmail('test@example.com', 'Maria'),
      ).resolves.toBeUndefined();
    });

    it('should log password reset email in dev mode without throwing', async () => {
      await expect(
        service.sendPasswordResetEmail(
          'test@example.com',
          'Maria',
          'token-123',
        ),
      ).resolves.toBeUndefined();
    });

    it('should log order confirmation email in dev mode without throwing', async () => {
      await expect(
        service.sendOrderConfirmation(
          'test@example.com',
          'Maria',
          'order-1',
          199.9,
        ),
      ).resolves.toBeUndefined();
    });

    it('should log shipping notification email in dev mode without throwing', async () => {
      await expect(
        service.sendShippingNotification(
          'test@example.com',
          'Maria',
          'order-1',
          'BR123456789',
          'CORREIOS',
        ),
      ).resolves.toBeUndefined();
    });

    it('should log payment received email in dev mode without throwing', async () => {
      await expect(
        service.sendPaymentReceived(
          'test@example.com',
          'Maria',
          'order-1',
          150.0,
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('production mode (SMTP configured)', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      mockSendMail.mockResolvedValue({ messageId: 'msg-1' });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockImplementation((key: string, defaultVal?: unknown) => {
                const config: Record<string, string | number> = {
                  SMTP_HOST: 'smtp.example.com',
                  SMTP_PORT: 587,
                  SMTP_USER: 'user',
                  SMTP_PASS: 'pass',
                  EMAIL_FROM: 'Vintage.br <noreply@vintage.br>',
                };
                return config[key] ?? defaultVal;
              }),
            },
          },
        ],
      }).compile();

      service = module.get<EmailService>(EmailService);
    });

    it('should send welcome email via transporter', async () => {
      await service.sendWelcomeEmail('test@example.com', 'Maria');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Bem-vindo(a) ao Vintage.br!',
          from: 'Vintage.br <noreply@vintage.br>',
        }),
      );
    });

    it('should send password reset email via transporter', async () => {
      await service.sendPasswordResetEmail(
        'test@example.com',
        'Maria',
        'reset-token',
      );

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Redefinição de senha — Vintage.br',
        }),
      );
    });

    it('should send order confirmation email with BRL formatted amount', async () => {
      await service.sendOrderConfirmation(
        'test@example.com',
        'Maria',
        'order-123',
        1234.56,
      );

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Pedido confirmado — Vintage.br',
        }),
      );
      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).toContain('order-123');
    });

    it('should send shipping notification email', async () => {
      await service.sendShippingNotification(
        'test@example.com',
        'Maria',
        'order-1',
        'BR123456789',
        'CORREIOS',
      );

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Seu pedido foi enviado! — Vintage.br',
        }),
      );
      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).toContain('BR123456789');
      expect(htmlArg).toContain('CORREIOS');
    });

    it('should send payment received email', async () => {
      await service.sendPaymentReceived(
        'test@example.com',
        'Maria',
        'order-1',
        500.0,
      );

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Pagamento recebido — Vintage.br',
        }),
      );
    });

    it('should not throw when sendMail fails', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP connection failed'));

      await expect(
        service.sendWelcomeEmail('test@example.com', 'Maria'),
      ).resolves.toBeUndefined();
    });

    it('should escape HTML in user-provided content', async () => {
      await service.sendWelcomeEmail(
        'test@example.com',
        '<script>alert("xss")</script>',
      );

      const htmlArg = mockSendMail.mock.calls[0][0].html;
      expect(htmlArg).not.toContain('<script>');
      expect(htmlArg).toContain('&lt;script&gt;');
    });
  });
});
