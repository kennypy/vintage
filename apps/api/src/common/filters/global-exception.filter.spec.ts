import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let res: { status: jest.Mock; json: jest.Mock };
  let host: { switchToHttp: jest.Mock };

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    host = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({ method: 'POST', url: '/api/v1/test', id: 'rid-1' }),
        getResponse: () => res,
      }),
    };
  });

  it('preserves HttpException status + message', () => {
    filter.catch(new NotFoundException('Usuário não encontrado'), host as never);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Usuário não encontrado',
      }),
    );
  });

  it('preserves class-validator array messages', () => {
    filter.catch(
      new BadRequestException({
        statusCode: 400,
        message: ['email must be an email', 'password is too short'],
        error: 'Bad Request',
      }),
      host as never,
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: ['email must be an email', 'password is too short'],
      }),
    );
  });

  it('preserves domain-specific scalar fields alongside the message', () => {
    filter.catch(
      new HttpException(
        {
          code: 'SOCIAL_PROVIDER_LINK_REQUIRED',
          message: 'Linking required',
          registeredWith: 'password',
        },
        409,
      ),
      host as never,
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SOCIAL_PROVIDER_LINK_REQUIRED',
        message: 'Linking required',
        registeredWith: 'password',
      }),
    );
  });

  it('strips stack trace from leaked messages', () => {
    const err = new UnauthorizedException(
      "Session invalidated\n    at JwtStrategy.validate (/app/dist/src/auth/jwt.strategy.js:45:12)\n    at async…",
    );
    filter.catch(err, host as never);
    const body = res.json.mock.calls[0][0];
    expect(body.message).not.toContain('at JwtStrategy.validate');
    expect(body.message).not.toContain('/app/dist/src/auth/');
  });

  it('truncates pathologically-long messages to 400 chars', () => {
    filter.catch(new BadRequestException('x'.repeat(2000)), host as never);
    const body = res.json.mock.calls[0][0];
    // 400 chars + the horizontal-ellipsis marker
    expect(body.message.length).toBeLessThanOrEqual(401);
    expect(body.message.endsWith('…')).toBe(true);
  });

  it('unknown errors → 500 with generic message (prod mode redacts debug)', () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      filter.catch(
        new Error('connect ECONNREFUSED 10.0.0.42:5432 postgres://vintage@internal-db'),
        host as never,
      );
      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      const body = res.json.mock.calls[0][0];
      expect(body.message).toBe('Internal server error');
      // Critical: the raw Postgres driver string with the internal
      // hostname + IP must NOT be on the response in prod.
      expect(body).not.toHaveProperty('debug');
      expect(JSON.stringify(body)).not.toContain('10.0.0.42');
      expect(JSON.stringify(body)).not.toContain('internal-db');
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('unknown errors → dev mode surfaces a truncated debug hint', () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      filter.catch(new Error('oh no'), host as never);
      const body = res.json.mock.calls[0][0];
      expect(body.message).toBe('Internal server error');
      expect(body.debug).toContain('oh no');
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('non-Error throws (e.g. string) still get a generic 500', () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      filter.catch('bare-string-throw', host as never);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      const body = res.json.mock.calls[0][0];
      expect(body.message).toBe('Internal server error');
      expect(body).not.toHaveProperty('debug');
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});
