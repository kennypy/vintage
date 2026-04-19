import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('MetricsController', () => {
  const buildController = async (token: string | undefined) => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        MetricsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((k: string, d: string = '') =>
              k === 'METRICS_TOKEN' ? token ?? '' : d,
            ),
          },
        },
      ],
    }).compile();
    // Fire onModuleInit manually so default-metrics registers.
    const svc = module.get(MetricsService);
    await svc.onModuleInit();
    return module.get<MetricsController>(MetricsController);
  };

  afterEach(() => {
    // prom-client's default-metrics registry is process-global and
    // can't be registered twice in the same run; wipe between tests.
    const { register } = require('prom-client') as { register: { clear: () => void } };
    register.clear();
  });

  it('refuses the scrape when METRICS_TOKEN is not configured (disabled-by-default)', async () => {
    const c = await buildController(undefined);
    await expect(c.scrape('anything')).rejects.toThrow(UnauthorizedException);
  });

  it('refuses a request missing the token header', async () => {
    const c = await buildController('super-secret-metrics-token');
    await expect(c.scrape(undefined)).rejects.toThrow(UnauthorizedException);
  });

  it('refuses a request whose token length differs from the configured one (no length oracle)', async () => {
    const c = await buildController('super-secret-metrics-token');
    await expect(c.scrape('short')).rejects.toThrow(UnauthorizedException);
  });

  it('refuses a same-length wrong token via timing-safe compare', async () => {
    const c = await buildController('aaaaaaaaaaaaaaaa');
    await expect(c.scrape('bbbbbbbbbbbbbbbb')).rejects.toThrow(UnauthorizedException);
  });

  it('emits a Prometheus-format body on a correct token', async () => {
    const c = await buildController('correct-token-correct-token-correct');
    const body = await c.scrape('correct-token-correct-token-correct');
    // Default node metrics prefixed with our namespace.
    expect(body).toMatch(/^#\s/m);
    expect(body).toMatch(/vintage_/);
  });
});
