import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { CaptchaGuard } from './captcha.guard';

function makeCtx(body: Record<string, unknown> = {}, ip = '1.2.3.4'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ body, ip, headers: {} }),
    }),
  } as unknown as ExecutionContext;
}

describe('CaptchaGuard', () => {
  it('is a no-op when CAPTCHA_ENFORCE is off', async () => {
    const captcha = {
      enforceEnabled: false,
      verify: jest.fn().mockResolvedValue(false),
    };
    const guard = new CaptchaGuard(captcha as any);

    const ok = await guard.canActivate(makeCtx({}));

    expect(ok).toBe(true);
    // Critical: guard must NOT touch the service while disabled.
    // Otherwise CAPTCHA_ENFORCE=false deploys would still exhaust
    // Turnstile quota on every auth call.
    expect(captcha.verify).not.toHaveBeenCalled();
  });

  it('rejects with 403 when enforcement is on and token is missing', async () => {
    const captcha = {
      enforceEnabled: true,
      verify: jest.fn().mockResolvedValue(false),
    };
    const guard = new CaptchaGuard(captcha as any);

    await expect(guard.canActivate(makeCtx({}))).rejects.toThrow(ForbiddenException);
  });

  it('rejects when verify returns false', async () => {
    const captcha = {
      enforceEnabled: true,
      verify: jest.fn().mockResolvedValue(false),
    };
    const guard = new CaptchaGuard(captcha as any);

    await expect(
      guard.canActivate(makeCtx({ captchaToken: 'bad' })),
    ).rejects.toThrow(ForbiddenException);
    expect(captcha.verify).toHaveBeenCalledWith('bad', '1.2.3.4');
  });

  it('passes when verify returns true', async () => {
    const captcha = {
      enforceEnabled: true,
      verify: jest.fn().mockResolvedValue(true),
    };
    const guard = new CaptchaGuard(captcha as any);

    const ok = await guard.canActivate(makeCtx({ captchaToken: 'valid' }));
    expect(ok).toBe(true);
  });

  it('uses Express-resolved req.ip and ignores raw X-Forwarded-For', async () => {
    // Trust-proxy is configured in main.ts, so Express already resolves
    // req.ip from the correct hop. Reading X-Forwarded-For directly
    // would let an attacker forge the remoteip field sent to Turnstile
    // (poisoning its risk score for other users). Pin that the guard
    // no longer touches the raw header.
    const captcha = {
      enforceEnabled: true,
      verify: jest.fn().mockResolvedValue(true),
    };
    const guard = new CaptchaGuard(captcha as any);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          body: { captchaToken: 't' },
          ip: '10.0.0.1',
          headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
        }),
      }),
    } as unknown as ExecutionContext;

    await guard.canActivate(ctx);
    expect(captcha.verify).toHaveBeenCalledWith('t', '10.0.0.1');
  });
});
