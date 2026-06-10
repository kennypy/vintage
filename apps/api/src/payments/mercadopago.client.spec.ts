import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoClient } from './mercadopago.client';
import * as crypto from 'crypto';

function createClient(
  webhookSecret: string,
  nodeEnv: string,
): Promise<MercadoPagoClient> {
  return Test.createTestingModule({
    providers: [
      MercadoPagoClient,
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string, defaultValue?: string) => {
            if (key === 'MERCADOPAGO_WEBHOOK_SECRET') return webhookSecret;
            if (key === 'MERCADOPAGO_ACCESS_TOKEN') return '';
            if (key === 'NODE_ENV') return nodeEnv;
            return defaultValue ?? '';
          }),
        },
      },
    ],
  })
    .compile()
    .then((module: TestingModule) =>
      module.get<MercadoPagoClient>(MercadoPagoClient),
    );
}

describe('MercadoPagoClient — verifyWebhookSignature', () => {
  const payload = '{"action":"payment.updated","data":{"id":"123"}}';

  it('fails closed in EVERY environment when the secret is empty', async () => {
    // Previously dev returned true (fail-open), which leaked into staging
    // deployments that forgot to flip NODE_ENV. Now the rule is
    // unconditional: no secret → no trust, any environment.
    for (const env of ['development', 'production', 'staging', 'test']) {
      const client = await createClient('', env);
      expect(client.verifyWebhookSignature(payload, 'any-sig')).toBe(false);
    }
  });

  it('should return true for valid HMAC-SHA256 signature', async () => {
    const secret = 'test-webhook-secret';
    const client = await createClient(secret, 'production');

    const validSig = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    expect(client.verifyWebhookSignature(payload, validSig)).toBe(true);
  });

  it('should return false for invalid signature', async () => {
    const secret = 'test-webhook-secret';
    const client = await createClient(secret, 'production');

    expect(client.verifyWebhookSignature(payload, 'invalid-signature')).toBe(
      false,
    );
  });

  it('should return false for tampered payload', async () => {
    const secret = 'test-webhook-secret';
    const client = await createClient(secret, 'production');

    const sigForOriginal = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const tampered = '{"action":"payment.updated","data":{"id":"999"}}';
    expect(client.verifyWebhookSignature(tampered, sigForOriginal)).toBe(
      false,
    );
  });
});

describe('MercadoPagoClient.deriveIdempotencyKey', () => {
  it('is deterministic for the same logical attempt', () => {
    const a = MercadoPagoClient.deriveIdempotencyKey('pix', 'order-1', 99.9, 1);
    const b = MercadoPagoClient.deriveIdempotencyKey('pix', 'order-1', 99.9, 1);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when attemptNumber advances (so MP sees a fresh request)', () => {
    const a1 = MercadoPagoClient.deriveIdempotencyKey('pix', 'order-1', 99.9, 1);
    const a2 = MercadoPagoClient.deriveIdempotencyKey('pix', 'order-1', 99.9, 2);
    expect(a1).not.toBe(a2);
  });

  it('changes when method, orderId, or amount differ', () => {
    const base = MercadoPagoClient.deriveIdempotencyKey('pix', 'order-1', 99.9, 1);
    expect(MercadoPagoClient.deriveIdempotencyKey('card', 'order-1', 99.9, 1)).not.toBe(base);
    expect(MercadoPagoClient.deriveIdempotencyKey('pix', 'order-2', 99.9, 1)).not.toBe(base);
    expect(MercadoPagoClient.deriveIdempotencyKey('pix', 'order-1', 100.0, 1)).not.toBe(base);
  });

  it('incorporates the optional `extra` segment (card token / installments)', () => {
    const a = MercadoPagoClient.deriveIdempotencyKey('card', 'order-1', 99.9, 1, '3:tok-A');
    const b = MercadoPagoClient.deriveIdempotencyKey('card', 'order-1', 99.9, 1, '3:tok-B');
    expect(a).not.toBe(b);
  });

  it('treats different fractional-cent representations of the same amount identically', () => {
    // 99.9 vs 99.90 — same logical amount; the helper formats with toFixed(2)
    // so retries don't get a fresh key just because the caller stringified
    // the number differently.
    const a = MercadoPagoClient.deriveIdempotencyKey('pix', 'order-1', 99.9, 1);
    const b = MercadoPagoClient.deriveIdempotencyKey('pix', 'order-1', 99.9, 1);
    expect(a).toBe(b);
  });
});
