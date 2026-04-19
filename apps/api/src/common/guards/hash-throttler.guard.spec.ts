import { HashThrottlerGuard } from './hash-throttler.guard';

describe('HashThrottlerGuard.getTracker', () => {
  // getTracker() is a protected method; expose it via a tiny subclass
  // so we can assert its behaviour without spinning up a full Nest app.
  class ExposedGuard extends HashThrottlerGuard {
    public tracker(req: Record<string, unknown>): Promise<string> {
      return this.getTracker(req);
    }
  }
  const guard = new ExposedGuard(
    {} as never,
    {} as never,
    {} as never,
  );

  it('buckets by IP address', async () => {
    const key = await guard.tracker({ ip: '203.0.113.7' });
    expect(key).toBe('203.0.113.7');
  });

  it('ignores X-API-Key so the header cannot be used to escape per-IP limits', async () => {
    // Pre-fix, two requests with different X-API-Key values would land in
    // different buckets — letting an attacker brute-force /auth/login by
    // cycling the header. With the fix, both buckets must equal the IP.
    const first = await guard.tracker({
      ip: '203.0.113.7',
      headers: { 'x-api-key': 'aaaa' },
    });
    const second = await guard.tracker({
      ip: '203.0.113.7',
      headers: { 'x-api-key': 'bbbb' },
    });
    expect(first).toBe('203.0.113.7');
    expect(second).toBe('203.0.113.7');
    expect(first).toBe(second);
  });

  it('falls through to connection.remoteAddress when req.ip is missing', async () => {
    const key = await guard.tracker({
      connection: { remoteAddress: '198.51.100.4' },
    });
    expect(key).toBe('198.51.100.4');
  });

  it('returns a stable sentinel when no IP is available', async () => {
    const key = await guard.tracker({});
    expect(key).toBe('unknown');
  });
});
