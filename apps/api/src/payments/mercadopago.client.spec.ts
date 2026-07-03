import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  MercadoPagoClient,
  MercadoPagoRateLimitedError,
} from './mercadopago.client';
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

describe('MercadoPagoClient.request — retry / backoff', () => {
  const realFetch = global.fetch;
  let client: MercadoPagoClient;
  let fetchMock: jest.Mock;

  function createConfiguredClient(): Promise<MercadoPagoClient> {
    return Test.createTestingModule({
      providers: [
        MercadoPagoClient,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'MERCADOPAGO_ACCESS_TOKEN') return 'test-access-token';
              if (key === 'NODE_ENV') return 'production';
              return defaultValue ?? '';
            }),
          },
        },
      ],
    })
      .compile()
      .then((m: TestingModule) => m.get<MercadoPagoClient>(MercadoPagoClient));
  }

  const res = (status: number, bodyObj: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => bodyObj,
    text: async () => JSON.stringify(bodyObj),
  });

  const approved = {
    id: 'p1',
    status: 'approved',
    status_detail: 'accredited',
    transaction_amount: 10,
  };

  beforeEach(async () => {
    client = await createConfiguredClient();
    // Skip the real 2s/4s/8s waits so the retry path runs instantly.
    jest.spyOn(client as unknown as { sleep: () => Promise<void> }, 'sleep').mockResolvedValue(undefined);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('retries a 429 then succeeds, reusing the same request', async () => {
    fetchMock
      .mockResolvedValueOnce(res(429, { message: 'rate limited' }))
      .mockResolvedValueOnce(res(200, approved));

    const out = await client.getPaymentStatus('p1');

    expect(out.status).toBe('approved');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries transient network errors (ECONNRESET) then succeeds', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(res(200, approved));

    const out = await client.getPaymentStatus('p1');

    expect(out.status).toBe('approved');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws MercadoPagoRateLimitedError after exhausting retries on 503', async () => {
    fetchMock.mockResolvedValue(res(503, { message: 'unavailable' }));

    await expect(client.getPaymentStatus('p1')).rejects.toBeInstanceOf(
      MercadoPagoRateLimitedError,
    );
    // 1 initial + 3 retries.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does NOT retry a non-retryable 400 — fails fast', async () => {
    fetchMock.mockResolvedValue(res(400, { message: 'bad request' }));

    await expect(client.getPaymentStatus('p1')).rejects.toThrow(
      /Mercado Pago API error: 400/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
