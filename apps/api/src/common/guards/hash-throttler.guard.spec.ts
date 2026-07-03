import { ServiceUnavailableException } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { HashThrottlerGuard } from './hash-throttler.guard';

describe('HashThrottlerGuard.canActivate — fail-closed on Redis outage', () => {
  const ctx = {
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as never;

  function makeGuard(opts: { marked: boolean; backendUp: boolean }) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(opts.marked),
    };
    const storage = {
      isBackendAvailable: jest.fn().mockReturnValue(opts.backendUp),
    };
    return new HashThrottlerGuard(
      {} as never,
      storage as never,
      reflector as never,
    );
  }

  afterEach(() => jest.restoreAllMocks());

  it('returns 503 on a @FailClosedThrottle route when Redis is down', async () => {
    const guard = makeGuard({ marked: true, backendUp: false });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('delegates to the normal limiter on a marked route when Redis is up', async () => {
    const superSpy = jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockResolvedValue(true);
    const guard = makeGuard({ marked: true, backendUp: true });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(superSpy).toHaveBeenCalled();
  });

  it('fails OPEN on an unmarked (browse) route even when Redis is down', async () => {
    const superSpy = jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockResolvedValue(true);
    const guard = makeGuard({ marked: false, backendUp: false });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(superSpy).toHaveBeenCalled();
  });
});

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

  it('buckets unauthenticated callers by IP address', async () => {
    const key = await guard.tracker({ ip: '203.0.113.7' });
    expect(key).toBe('ip:203.0.113.7');
  });

  it('buckets authenticated callers by user.id — independent of IP', async () => {
    const a = await guard.tracker({ ip: '203.0.113.7', user: { id: 'user-1' } });
    const b = await guard.tracker({ ip: '198.51.100.4', user: { id: 'user-1' } });
    expect(a).toBe('u:user-1');
    expect(b).toBe('u:user-1');
    expect(a).toBe(b);
  });

  it('two authenticated users on the SAME IP get SEPARATE buckets', async () => {
    // NAT / office wifi / corporate proxy: multiple users share an
    // egress IP. Per-user bucketing keeps one compromised account
    // from exhausting the throttle for bystanders.
    const a = await guard.tracker({ ip: '203.0.113.7', user: { id: 'alice' } });
    const b = await guard.tracker({ ip: '203.0.113.7', user: { id: 'bob' } });
    expect(a).not.toBe(b);
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
    expect(first).toBe('ip:203.0.113.7');
    expect(second).toBe('ip:203.0.113.7');
    expect(first).toBe(second);
  });

  it('falls through to connection.remoteAddress when req.ip is missing', async () => {
    const key = await guard.tracker({
      connection: { remoteAddress: '198.51.100.4' },
    });
    expect(key).toBe('ip:198.51.100.4');
  });

  it('returns a stable sentinel when no IP is available', async () => {
    const key = await guard.tracker({});
    expect(key).toBe('ip:unknown');
  });

  it('user-bucket and ip-bucket namespaces cannot collide', async () => {
    // A user whose id happened to look like `ip:198.51.100.4` still
    // ends up under `u:` prefix. Safety: attacker-controlled inputs
    // (user ids are server-generated, but the guard shouldn't have
    // to care) cannot reach an IP bucket.
    const u = await guard.tracker({ user: { id: 'ip:198.51.100.4' } });
    expect(u).toBe('u:ip:198.51.100.4');
    expect(u.startsWith('u:')).toBe(true);
  });
});
