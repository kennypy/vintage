import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Final backstop for anything the controller-level exception handler
 * didn't already shape.
 *
 * Why we need it on top of Nest's built-in:
 *   * Nest's default handler serialises non-HttpException errors with
 *     a generic shape, but it still lets `response.message` flow
 *     through from the raw error when the error subclass doesn't
 *     override it — which for `TypeError`, `PrismaClientKnownRequestError`,
 *     `Error('connect ECONNREFUSED 10.0.0.1:5432')`, and similar
 *     leaks implementation details straight to the client
 *     (internal hostnames, driver-specific error codes, stack
 *     fragments).
 *   * We want every 5xx to return a SINGLE opaque message in
 *     production. Dev keeps richer output for debugging.
 *
 * The filter:
 *   * Logs the real error + request id server-side so operators can
 *     correlate (structured logger, not the response body).
 *   * For `HttpException` (4xx + deliberate 5xx like
 *     UnauthorizedException): preserve the status code; truncate the
 *     message to 400 chars; strip any stack trace that made it into
 *     the response object.
 *   * For anything else: 500 with a fixed `Internal server error`.
 *     In dev, append the truncated error class + message under a
 *     `debug` key so we don't hobble the feedback loop.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const isProd = process.env.NODE_ENV === 'production';

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      // Nest wraps string messages into { statusCode, message, error }.
      // Accept both shapes.
      const body =
        typeof raw === 'string'
          ? { statusCode: status, message: this.truncate(raw) }
          : this.sanitizeHttpBody(
              raw as Record<string, unknown>,
              status,
            );
      if (status >= 500) {
        this.logger.error(
          `${req.method} ${req.url} → ${status} ${this.briefLog(exception)}`,
        );
      } else {
        this.logger.warn(
          `${req.method} ${req.url} → ${status} ${this.briefLog(exception)}`,
        );
      }
      res.status(status).json(body);
      return;
    }

    // Unknown throw — bug in our code or a runtime lib exception
    // (Prisma, AWS SDK, fetch). The full shape is NOT safe to send.
    this.logger.error(
      `${req.method} ${req.url} → 500 UNHANDLED ${this.briefLog(exception)}`,
    );
    const body: Record<string, unknown> = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
    if (!isProd) {
      body.debug = this.truncate(String(exception));
    }
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }

  private truncate(value: string): string {
    const max = 400;
    return value.length > max ? `${value.slice(0, max)}…` : value;
  }

  /** For HttpException responses: keep the documented shape + cap
   *  each string field length. Strip anything that smells like a
   *  stack trace (multi-line 'at ' frames). */
  private sanitizeHttpBody(
    raw: Record<string, unknown>,
    status: number,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { statusCode: status };
    for (const key of ['message', 'error', 'code']) {
      const v = raw[key];
      if (typeof v === 'string') {
        out[key] = this.truncate(this.stripStack(v));
      } else if (Array.isArray(v)) {
        // class-validator puts error strings in `message` as an array.
        out[key] = v
          .filter((it) => typeof it === 'string')
          .map((it) => this.truncate(this.stripStack(it as string)));
      } else if (v !== undefined) {
        out[key] = v;
      }
    }
    // Preserve domain-specific machine-readable fields (we use these
    // e.g. in SOCIAL_PROVIDER_LINK_REQUIRED) — any scalar key NOT in
    // the default set that the handler deliberately included.
    for (const [k, v] of Object.entries(raw)) {
      if (out[k] !== undefined) continue;
      if (
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean'
      ) {
        out[k] = typeof v === 'string' ? this.truncate(this.stripStack(v)) : v;
      }
    }
    return out;
  }

  private stripStack(s: string): string {
    const idx = s.indexOf('\n    at ');
    return idx >= 0 ? s.slice(0, idx) : s;
  }

  private briefLog(exception: unknown): string {
    if (exception instanceof Error) {
      return `${exception.name}: ${this.truncate(exception.message)}`;
    }
    return this.truncate(String(exception));
  }
}
