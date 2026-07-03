import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertShippingMockAllowed } from './shipping-mock.util';
import { JadlogClient } from './jadlog.client';
import { KanguClient } from './kangu.client';

describe('assertShippingMockAllowed', () => {
  it('throws in production so a fake rate/label is never returned', () => {
    expect(() => assertShippingMockAllowed('production', 'Correios', 'rates')).toThrow(
      ServiceUnavailableException,
    );
  });

  it('is a no-op outside production (dev keeps working without credentials)', () => {
    expect(() => assertShippingMockAllowed('development', 'Correios', 'rates')).not.toThrow();
    expect(() => assertShippingMockAllowed('test', 'Correios', 'label')).not.toThrow();
  });
});

function config(nodeEnv: string, extra: Record<string, string> = {}) {
  return {
    get: jest.fn((key: string, def?: string) =>
      key === 'NODE_ENV' ? nodeEnv : (extra[key] ?? def ?? ''),
    ),
  } as unknown as ConfigService;
}

describe('shipping clients — mock fallback inversion', () => {
  describe('unconfigured carrier (JadlogClient)', () => {
    it('THROWS in production instead of returning a mock rate', async () => {
      const client = new JadlogClient(config('production')); // no JADLOG_TOKEN
      await expect(
        client.calculateRates('01310-000', '20040-002', 500),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('THROWS in production instead of returning a mock label', async () => {
      const client = new JadlogClient(config('production'));
      await expect(
        client.generateLabel('order-1', 'origem', 'destino', 500),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('still returns a mock in development for local flows', async () => {
      const client = new JadlogClient(config('development'));
      const rates = await client.calculateRates('01310-000', '20040-002', 500);
      expect(rates.length).toBeGreaterThan(0);
    });
  });

  describe('configured carrier whose real API fails (KanguClient)', () => {
    const realFetch = global.fetch;
    afterEach(() => {
      global.fetch = realFetch;
    });

    it('THROWS in production when the carrier API returns an error (no fake rate)', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
      const client = new KanguClient(config('production', { KANGU_API_KEY: 'k' }));

      await expect(
        client.calculateRates('01310-000', '20040-002', 500),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('falls back to a mock in development when the API fails', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
      const client = new KanguClient(config('development', { KANGU_API_KEY: 'k' }));

      const rates = await client.calculateRates('01310-000', '20040-002', 500);
      expect(rates.length).toBeGreaterThan(0);
    });
  });
});
