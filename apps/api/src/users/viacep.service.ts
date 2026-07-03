import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../common/services/redis.service';

export interface ViaCepResult {
  city: string;
  state: string;
}

/**
 * Resolves a Brazilian CEP to its official municipality / UF via ViaCEP
 * (https://viacep.com.br — free, no key). Used to validate that a
 * user-entered address actually corresponds to its postal code before we
 * accept it, so a typo'd CEP or a mismatched city doesn't surface later as
 * an undeliverable shipment.
 *
 * Resilience contract:
 *   - erro:true  → throws BadRequestException (the CEP does not exist).
 *   - ViaCEP unreachable / slow / malformed → returns null so the caller
 *     falls back to the regex-only format check (the DTO already enforced
 *     the NNNNN-NNN shape). A third-party outage must NOT block checkout.
 *   - Results are cached in Redis (CEPs are stable) to avoid hammering
 *     ViaCEP and to keep repeat lookups instant.
 */
@Injectable()
export class ViaCepService {
  private readonly logger = new Logger(ViaCepService.name);

  private static readonly CACHE_PREFIX = 'viacep:';
  private static readonly CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
  private static readonly TIMEOUT_MS = 4000;
  private static readonly ERRO_SENTINEL = 'ERRO';

  constructor(private readonly redis: RedisService) {}

  async lookup(cepRaw: string): Promise<ViaCepResult | null> {
    const cep = cepRaw.replace(/\D/g, '');
    // The DTO already enforced the format; belt-and-suspenders before we
    // splice into the URL (also keeps the cache key clean).
    if (cep.length !== 8) return null;

    const cacheKey = ViaCepService.CACHE_PREFIX + cep;

    const cached = await this.redis.get(cacheKey);
    if (cached === ViaCepService.ERRO_SENTINEL) {
      throw new BadRequestException('CEP não encontrado.');
    }
    if (cached) {
      const [city, state] = cached.split('|');
      if (city && state) return { city, state };
    }

    type ViaCepResponse = { localidade?: string; uf?: string; erro?: boolean };
    let data: ViaCepResponse | null = null;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        signal: AbortSignal.timeout(ViaCepService.TIMEOUT_MS),
      });
      if (!res.ok) return null;
      data = (await res.json()) as ViaCepResponse;
    } catch (err) {
      this.logger.warn(
        `ViaCEP lookup failed for ${cep} — falling back to regex-only: ${String(err).slice(0, 200)}`,
      );
      return null;
    }

    if (data?.erro) {
      await this.redis.setNx(
        cacheKey,
        ViaCepService.ERRO_SENTINEL,
        ViaCepService.CACHE_TTL_SECONDS,
      );
      throw new BadRequestException('CEP não encontrado.');
    }

    const city = String(data?.localidade ?? '').trim();
    const state = String(data?.uf ?? '').trim();
    if (!city || !state) return null; // malformed — don't block on it

    await this.redis.setNx(
      cacheKey,
      `${city}|${state}`,
      ViaCepService.CACHE_TTL_SECONDS,
    );
    return { city, state };
  }

  /**
   * Normalize a city name for comparison: strip accents, lowercase,
   * collapse whitespace. "São Paulo" and "sao  paulo" compare equal.
   */
  static normalizeCity(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }
}
