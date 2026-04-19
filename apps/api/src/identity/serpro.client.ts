import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Serpro Datavalid CPF client.
 *
 * Talks to Serpro's official CPF validation service (reads Receita
 * Federal directly — authoritative source). OAuth2 client_credentials
 * flow; tokens cached in-memory until near-expiry.
 *
 * Concrete API paths come from the Serpro contract PDF you receive
 * when procurement closes. The base URL is fully env-driven
 * (`SERPRO_BASE_URL`) so we can point at staging / production / a
 * test stub without recompiling. The two paths below are the shape
 * Serpro's public Datavalid docs describe; if the contract specifies
 * something different, flip `SERPRO_TOKEN_PATH` / `SERPRO_VALIDATE_PATH`.
 *
 * Fail-closed semantics everywhere: any error path returns a result
 * that the caller MUST treat as "not verified". We never synthesise
 * a VERIFIED result for an unreachable Serpro — a confused provider
 * could otherwise open the payout gate.
 */

/** Maximum time we'll wait for Serpro before giving up. 5s is plenty
 *  — the endpoint typically responds in 400-800ms. */
const REQUEST_TIMEOUT_MS = 5000;

/** How many seconds before a token's stated expiry we proactively
 *  refresh. Guards against clock skew + in-flight request races. */
const TOKEN_EXPIRY_SAFETY_MS = 60 * 1000;

export type SerproResult =
  | 'VERIFIED'
  | 'NAME_MISMATCH'
  | 'CPF_SUSPENDED'
  | 'CPF_CANCELED'
  | 'DECEASED'
  | 'PROVIDER_ERROR'
  | 'CONFIG_ERROR';

export interface SerproVerifyRequest {
  cpf: string; // digits only
  name: string;
  birthDate: string; // ISO 'YYYY-MM-DD'
}

export interface SerproVerifyResponse {
  result: SerproResult;
  /** Serpro's raw situação code when available — for ops triage only,
   *  never surfaced to the client. */
  situacao?: string;
  /** Provider-side correlation id; useful when filing a support
   *  ticket against Serpro. */
  providerRequestId?: string;
}

/** Serpro's situação-cadastral vocabulary at Receita. */
const SITUACAO_VERIFIED = 'REGULAR';
const SITUACAO_SUSPENDED = 'SUSPENSA';
const SITUACAO_CANCELED = new Set(['CANCELADA', 'NULA']);
const SITUACAO_DECEASED = new Set([
  'TITULAR_FALECIDO',
  'TITULAR FALECIDO',
  'FALECIDO',
]);

@Injectable()
export class SerproClient {
  private readonly logger = new Logger(SerproClient.name);

  private readonly baseUrl: string;
  private readonly tokenPath: string;
  private readonly validatePath: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly configured: boolean;

  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('SERPRO_BASE_URL', '').replace(/\/$/, '');
    this.tokenPath = config.get<string>('SERPRO_TOKEN_PATH', '/token');
    this.validatePath = config.get<string>(
      'SERPRO_VALIDATE_PATH',
      '/datavalid/v3/validate',
    );
    this.clientId = config.get<string>('SERPRO_CLIENT_ID', '');
    this.clientSecret = config.get<string>('SERPRO_CLIENT_SECRET', '');
    this.configured =
      !!this.baseUrl && !!this.clientId && !!this.clientSecret;

    if (!this.configured) {
      this.logger.warn(
        'Serpro not configured (SERPRO_BASE_URL / SERPRO_CLIENT_ID / SERPRO_CLIENT_SECRET missing) — CPF verification will return CONFIG_ERROR',
      );
    }
  }

  get isConfigured(): boolean {
    return this.configured;
  }

  async verify(req: SerproVerifyRequest): Promise<SerproVerifyResponse> {
    if (!this.configured) {
      return { result: 'CONFIG_ERROR' };
    }

    let token: string;
    try {
      token = await this.getToken();
    } catch (err) {
      this.logger.warn(
        `Serpro token fetch failed: ${String(err).slice(0, 200)}`,
      );
      return { result: 'PROVIDER_ERROR' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}${this.validatePath}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cpf: req.cpf,
          nome: req.name,
          // Serpro accepts ISO dates directly per Datavalid docs.
          dataNascimento: req.birthDate,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(
          `Serpro validate returned ${response.status} for req ${response.headers.get('x-request-id') ?? '?'}`,
        );
        return {
          result: 'PROVIDER_ERROR',
          providerRequestId: response.headers.get('x-request-id') ?? undefined,
        };
      }

      const payload = (await response.json()) as {
        cpf?: { situacao?: string };
        nome?: { match?: boolean };
        dataNascimento?: { match?: boolean };
      };

      const situacao = payload.cpf?.situacao?.toUpperCase();
      if (!situacao) {
        return { result: 'PROVIDER_ERROR' };
      }

      // Non-REGULAR situações short-circuit before the name/DOB match
      // — a suspended CPF is never "verified" regardless of name.
      if (SITUACAO_CANCELED.has(situacao)) {
        return { result: 'CPF_CANCELED', situacao };
      }
      if (SITUACAO_DECEASED.has(situacao)) {
        return { result: 'DECEASED', situacao };
      }
      if (situacao === SITUACAO_SUSPENDED) {
        return { result: 'CPF_SUSPENDED', situacao };
      }
      if (situacao !== SITUACAO_VERIFIED) {
        // Unknown situação — treat as provider error rather than
        // silently passing through. Surfaces via dashboard + PR triage.
        return { result: 'PROVIDER_ERROR', situacao };
      }

      // Situação OK. Both name AND DOB must match — either
      // mismatch is a NAME_MISMATCH for our purposes (the caller
      // gets a single actionable signal; ops can drill into the
      // log entry if they need to know which field disagreed).
      const nameMatch = payload.nome?.match === true;
      const dobMatch = payload.dataNascimento?.match === true;
      if (!nameMatch || !dobMatch) {
        return { result: 'NAME_MISMATCH', situacao };
      }

      return { result: 'VERIFIED', situacao };
    } catch (err) {
      this.logger.warn(
        `Serpro validate threw: ${String(err).slice(0, 200)}`,
      );
      return { result: 'PROVIDER_ERROR' };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Returns a live token, fetching a new one if none is cached or
   *  the cached one is within TOKEN_EXPIRY_SAFETY_MS of expiry. */
  private async getToken(): Promise<string> {
    const now = Date.now();
    if (
      this.cachedToken &&
      this.cachedToken.expiresAt - TOKEN_EXPIRY_SAFETY_MS > now
    ) {
      return this.cachedToken.token;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const basic = Buffer.from(
        `${this.clientId}:${this.clientSecret}`,
      ).toString('base64');
      const response = await fetch(`${this.baseUrl}${this.tokenPath}`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`token endpoint ${response.status}`);
      }
      const data = (await response.json()) as {
        access_token?: string;
        expires_in?: number;
      };
      if (!data.access_token) {
        throw new Error('token response missing access_token');
      }
      const expiresIn = Number(data.expires_in) || 3600;
      this.cachedToken = {
        token: data.access_token,
        expiresAt: now + expiresIn * 1000,
      };
      return data.access_token;
    } finally {
      clearTimeout(timer);
    }
  }
}
