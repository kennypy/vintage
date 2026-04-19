import { Controller, Get, Header, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from './metrics.service';

/**
 * Prometheus scrape endpoint. Not exposed via Swagger — internal only.
 *
 * Access control: a pre-shared token on the `X-Metrics-Token` header.
 * Ops configures METRICS_TOKEN (32+ random hex) and the Prometheus
 * scrape job (or Fly internal ingress) presents the same value. No
 * token configured = endpoint disabled, returns 401. This keeps
 * dashboards from being a fingerprinting surface for external
 * scanners.
 */
@Controller('metrics')
@ApiExcludeController()
export class MetricsController {
  private readonly configuredToken: string;

  constructor(
    private readonly metrics: MetricsService,
    config: ConfigService,
  ) {
    this.configuredToken = config.get<string>('METRICS_TOKEN', '');
  }

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  async scrape(
    @Headers('x-metrics-token') presentedToken?: string,
  ): Promise<string> {
    if (!this.configuredToken) {
      // Disabled by default — turn on via METRICS_TOKEN env.
      throw new UnauthorizedException('Metrics endpoint disabled.');
    }
    // Constant-time compare to block timing-based token recovery.
    // Length-mismatch short-circuit keeps timingSafeEqual from throwing.
    if (
      !presentedToken ||
      presentedToken.length !== this.configuredToken.length
    ) {
      throw new UnauthorizedException();
    }
    const { timingSafeEqual } = await import('node:crypto');
    const a = Buffer.from(presentedToken, 'utf8');
    const b = Buffer.from(this.configuredToken, 'utf8');
    if (!timingSafeEqual(a, b)) {
      throw new UnauthorizedException();
    }
    return this.metrics.snapshot();
  }
}
