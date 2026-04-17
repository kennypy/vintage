import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/services/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — verifica dependências' })
  async ready(@Res() res: Response) {
    const checks: Record<string, 'ok' | 'error' | 'skipped'> = {};

    // Database connectivity check
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    // Redis ping
    try {
      const ok = await this.redis.ping();
      checks.redis = ok ? 'ok' : 'error';
    } catch {
      checks.redis = 'error';
    }

    // Meilisearch ping
    const meiliHost = this.config.get<string>('MEILISEARCH_HOST', '');
    if (meiliHost) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2000);
        const resp = await fetch(`${meiliHost.replace(/\/$/, '')}/health`, {
          signal: controller.signal,
        });
        clearTimeout(timer);
        checks.meilisearch = resp.ok ? 'ok' : 'error';
      } catch {
        checks.meilisearch = 'error';
      }
    } else {
      checks.meilisearch = 'skipped';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok' || v === 'skipped');

    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    });
  }
}
