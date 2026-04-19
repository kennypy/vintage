import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

/**
 * CSP violation reporter. The browser POSTs here when something in
 * the CSP header blocks a load — stylesheet from a domain we forgot
 * to allowlist, inline script injected by a compromised third-party
 * widget, a malformed redirect, etc.
 *
 * Why we need it: CSP without a report-uri is flying blind. A
 * legitimate violation report is often the first signal a user hits
 * a broken state (we deployed something that loads from a new
 * domain); a suspicious pattern is an early hint that an XSS or
 * mixed-content attempt is probing. We log the report as a
 * structured line that the SIEM can alert on, and that's it — no
 * DB write, no per-IP state (the endpoint is unauthenticated and
 * lives on the public surface).
 *
 * Browser behaviour: reports arrive as `Content-Type:
 * application/csp-report` with a JSON body shaped like
 * `{ "csp-report": { ... } }`. Some browsers batch to
 * `application/reports+json`; we accept either and extract the
 * first report for logging.
 *
 * Excluded from Swagger because this is browser-telemetry, not an
 * API product endpoint.
 */
@Controller('csp-report')
@ApiExcludeController()
export class CspReportController {
  private readonly logger = new Logger(CspReportController.name);

  @Post()
  @HttpCode(204)
  report(
    @Body() body: unknown,
    @Headers('user-agent') ua?: string,
  ): void {
    // Never throw; this is best-effort telemetry. Any parse failure
    // just means less signal — we don't want broken reporters to
    // spam 5xx in our own dashboards.
    try {
      const report = this.extractReport(body);
      if (!report) return;
      // Truncate every field to cap log-line length. Real reports
      // are short; an abusive reporter firing multi-MB bodies would
      // otherwise flood the logger.
      this.logger.warn(
        `[csp-report] ${JSON.stringify({
          docUri: this.cap(report['document-uri']),
          violated: this.cap(report['violated-directive']),
          effective: this.cap(report['effective-directive']),
          blocked: this.cap(report['blocked-uri']),
          source: this.cap(report['source-file']),
          line: report['line-number'],
          col: report['column-number'],
          disposition: report['disposition'],
          ua: this.cap(ua),
        })}`,
      );
    } catch (err) {
      this.logger.warn(`[csp-report] failed to log: ${String(err).slice(0, 200)}`);
    }
  }

  /** Pull the report payload out of either the legacy or modern shape. */
  private extractReport(body: unknown): Record<string, unknown> | null {
    if (!body || typeof body !== 'object') return null;
    // Legacy: { "csp-report": { ... } }
    const legacy = (body as Record<string, unknown>)['csp-report'];
    if (legacy && typeof legacy === 'object') return legacy as Record<string, unknown>;
    // Reporting-API batched: Array<{ type, body }> — take the first
    // entry whose type is "csp-violation".
    if (Array.isArray(body)) {
      const hit = body.find(
        (b) =>
          b &&
          typeof b === 'object' &&
          (b as Record<string, unknown>).type === 'csp-violation',
      );
      if (hit) {
        const hitBody = (hit as Record<string, unknown>).body;
        return hitBody && typeof hitBody === 'object'
          ? (hitBody as Record<string, unknown>)
          : null;
      }
    }
    return null;
  }

  private cap(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    return value.length > 400 ? `${value.slice(0, 400)}…` : value;
  }
}
