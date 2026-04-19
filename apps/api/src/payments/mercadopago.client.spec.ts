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
