import { BadRequestException } from '@nestjs/common';
import { ViaCepService } from './viacep.service';
import { RedisService } from '../common/services/redis.service';

describe('ViaCepService', () => {
  const realFetch = global.fetch;
  let redis: { get: jest.Mock; setNx: jest.Mock };
  let service: ViaCepService;

  beforeEach(() => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      setNx: jest.fn().mockResolvedValue(true),
    };
    service = new ViaCepService(redis as unknown as RedisService);
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.clearAllMocks();
  });

  const okResponse = (body: unknown) =>
    ({ ok: true, json: async () => body }) as unknown as Response;

  it('resolves a valid CEP to city/state and caches it', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(okResponse({ localidade: 'São Paulo', uf: 'SP' })) as never;

    const result = await service.lookup('01310-000');

    expect(result).toEqual({ city: 'São Paulo', state: 'SP' });
    expect(redis.setNx).toHaveBeenCalledWith(
      'viacep:01310000',
      'São Paulo|SP',
      expect.any(Number),
    );
  });

  it('throws BadRequest when ViaCEP reports the CEP does not exist (erro:true)', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse({ erro: true })) as never;

    await expect(service.lookup('00000-000')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Negative result is cached to avoid re-hitting ViaCEP.
    expect(redis.setNx).toHaveBeenCalledWith(
      'viacep:00000000',
      'ERRO',
      expect.any(Number),
    );
  });

  it('serves from cache without hitting the network', async () => {
    redis.get.mockResolvedValue('Rio de Janeiro|RJ');
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;

    const result = await service.lookup('20040-002');

    expect(result).toEqual({ city: 'Rio de Janeiro', state: 'RJ' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null (regex-only fallback) when ViaCEP is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ETIMEDOUT')) as never;

    await expect(service.lookup('01310-000')).resolves.toBeNull();
  });

  it('normalizeCity strips accents/case/whitespace for comparison', () => {
    expect(ViaCepService.normalizeCity('São Paulo')).toBe(
      ViaCepService.normalizeCity('sao  paulo'),
    );
  });
});
