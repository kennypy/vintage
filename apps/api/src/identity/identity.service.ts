import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import { isValidCPF } from '@vintage/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  SerproClient,
  SerproResult,
  SerproVerifyResponse,
} from './serpro.client';
import {
  CafClient,
  CafWebhookPayload,
  CafWebhookDecision,
} from './caf.client';

export interface VerifyIdentityResult {
  status: SerproResult;
  /** When `status === 'VERIFIED'`, the User row's
   *  cpfIdentityVerified is now true. Callers can skip re-querying
   *  the DB if they only need the flag. */
  identityVerified: boolean;
  /** Human-readable explanation for the client. Safe to surface in
   *  API responses — no PII, no internal details. */
  message: string;
}

/** User-facing messages keyed by the SerproResult taxonomy. Held as
 *  a module constant so QA can diff them across releases without
 *  inspecting the client. */
const RESULT_MESSAGES: Record<SerproResult, string> = {
  VERIFIED: 'Identidade verificada.',
  NAME_MISMATCH:
    'Os dados informados não conferem com os registros da Receita Federal. Verifique nome completo e data de nascimento.',
  CPF_SUSPENDED:
    'Seu CPF consta como suspenso na Receita Federal. Regularize em https://servicos.receita.fazenda.gov.br antes de tentar novamente.',
  CPF_CANCELED:
    'Seu CPF consta como cancelado ou nulo na Receita Federal.',
  DECEASED:
    'O CPF informado consta como de titular falecido. Esta conta não pode ser verificada.',
  PROVIDER_ERROR:
    'Não foi possível verificar agora. Tente novamente em alguns minutos.',
  CONFIG_ERROR:
    'Verificação de identidade indisponível no momento. Aguarde — nossa equipe foi notificada.',
};

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);
  private readonly enforceEnabled: boolean;
  private readonly documentEnabled: boolean;
  private readonly webhookBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly serpro: SerproClient,
    private readonly caf: CafClient,
    config: ConfigService,
  ) {
    const raw = config
      .get<string>('IDENTITY_VERIFICATION_ENABLED', 'false')
      .toLowerCase();
    this.enforceEnabled = raw === 'true' || raw === '1' || raw === 'yes';

    // Track C is independently gated — the Serpro contract can land
    // before Caf's does, so the two flags are separate.
    const docRaw = config
      .get<string>('IDENTITY_DOCUMENT_ENABLED', 'false')
      .toLowerCase();
    this.documentEnabled =
      docRaw === 'true' || docRaw === '1' || docRaw === 'yes';

    // Public origin of our API — Caf posts its webhook here.
    // Derive from WEBHOOK_BASE_URL, falling back to the CORS origin
    // config only as a last resort for local dev.
    this.webhookBaseUrl = (
      config.get<string>('WEBHOOK_BASE_URL', '') ||
      config.get<string>('API_PUBLIC_URL', '') ||
      'http://localhost:3001'
    ).replace(/\/$/, '');

    // SSRF guard: WEBHOOK_BASE_URL is what we hand to Caf as the callback
    // destination. An attacker who can poison this env (compromised
    // ops account, leaked secrets manager) could redirect Caf's
    // verification webhooks at an internal service to mint fake
    // approvals. Validate the URL shape at boot so the deployment
    // refuses to start with a tainted value rather than failing at
    // verification time. Localhost / private IPs are allowed in
    // development for local tunneling (ngrok/cloudflared bypass).
    const nodeEnv = config.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'production') {
      try {
        const parsed = new URL(this.webhookBaseUrl);
        if (parsed.protocol !== 'https:') {
          throw new Error(`WEBHOOK_BASE_URL must be https in production (got ${parsed.protocol}).`);
        }
        if (
          parsed.hostname === 'localhost' ||
          parsed.hostname === '127.0.0.1' ||
          parsed.hostname.endsWith('.local') ||
          parsed.hostname.endsWith('.internal')
        ) {
          throw new Error(`WEBHOOK_BASE_URL must not point at a private host in production (got ${parsed.hostname}).`);
        }
      } catch (err) {
        if (err instanceof Error) throw err;
        throw new Error(
          `WEBHOOK_BASE_URL is not a valid URL: ${this.webhookBaseUrl}`,
          { cause: err },
        );
      }
    }

    if (!this.enforceEnabled) {
      this.logger.warn(
        'IDENTITY_VERIFICATION_ENABLED=false — verifyCpf will short-circuit with CONFIG_ERROR. Flip to true when the Serpro contract is active.',
      );
    }
    if (!this.documentEnabled) {
      this.logger.warn(
        'IDENTITY_DOCUMENT_ENABLED=false — Caf document+liveness escalation disabled. Flip when the Caf contract is active.',
      );
    }
  }

  /**
   * Run Serpro Datavalid for the given user using a caller-supplied
   * birthDate. On VERIFIED, flips cpfIdentityVerified=true
   * transactionally alongside the audit log write so there's no
   * window where one is set without the other.
   *
   * birthDate is ISO 'YYYY-MM-DD'. Persisted to User.birthDate on
   * success so future verifications (re-runs after CPF situação
   * churn) don't need to re-prompt.
   */
  async verifyCpf(
    userId: string,
    birthDate: string,
  ): Promise<VerifyIdentityResult> {
    if (!this.enforceEnabled) {
      await this.logAttempt(userId, 'UNKNOWN_CPF', 'SERPRO', 'CONFIG_ERROR');
      return {
        status: 'CONFIG_ERROR',
        identityVerified: false,
        message: RESULT_MESSAGES.CONFIG_ERROR,
      };
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      throw new BadRequestException(
        'Data de nascimento inválida. Formato esperado: AAAA-MM-DD.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, cpf: true, name: true, cpfIdentityVerified: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    if (!user.cpf) {
      throw new BadRequestException(
        'Adicione um CPF antes de solicitar verificação de identidade.',
      );
    }
    if (!isValidCPF(user.cpf)) {
      // Defence in depth — setCpf already validates, but a hand-
      // edited DB row could slip through. Refuse to spend a Serpro
      // call on a CPF we can prove is bogus.
      return {
        status: 'CPF_CANCELED',
        identityVerified: false,
        message: RESULT_MESSAGES.CPF_CANCELED,
      };
    }

    // Already verified — short-circuit. Ops can force a re-run via
    // a direct admin flow (not exposed here).
    if (user.cpfIdentityVerified) {
      return {
        status: 'VERIFIED',
        identityVerified: true,
        message: RESULT_MESSAGES.VERIFIED,
      };
    }

    const response: SerproVerifyResponse = await this.serpro.verify({
      cpf: user.cpf,
      name: user.name,
      birthDate,
    });

    const cpfHash = this.hashCpf(user.cpf);

    if (response.result === 'VERIFIED') {
      // Transaction: flip the flag + persist the birth date + log
      // the attempt atomically. A crash between any two of these
      // would either (a) leave the flag on without a log row (ops
      // panic but no user impact) or (b) leave the flag off with
      // a successful log row (user sees "please try again" and
      // re-submits). Both are recoverable; but doing them in a
      // tx keeps the invariants cleanest.
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: userId },
          data: {
            cpfIdentityVerified: true,
            birthDate: new Date(`${birthDate}T00:00:00Z`),
          },
        }),
        this.prisma.cpfVerificationLog.create({
          data: {
            userId,
            cpfHash,
            provider: 'SERPRO',
            result: 'VERIFIED',
          },
        }),
      ]);
      this.logger.log(`User ${userId} cpfIdentityVerified via Serpro`);
      return {
        status: 'VERIFIED',
        identityVerified: true,
        message: RESULT_MESSAGES.VERIFIED,
      };
    }

    // Non-VERIFIED paths: log the outcome but don't mutate the User
    // row. The user can correct the birthDate + retry.
    await this.logAttempt(userId, cpfHash, 'SERPRO', response.result);

    return {
      status: response.result,
      identityVerified: false,
      message: RESULT_MESSAGES[response.result],
    };
  }

  // --- Track C: document + liveness via Caf ---

  /**
   * Open a new Caf document + liveness session for this user.
   * Returns the redirect URL the client should open (WebView on
   * mobile, new tab on web). When Caf finishes processing, their
   * webhook lands at /webhooks/caf and we flip the flag on
   * APPROVED.
   *
   * Short-circuits to CONFIG_ERROR when the feature flag is off or
   * Caf isn't configured — the caller surfaces a "try again later"
   * message without burning a Caf session.
   */
  async createDocumentSession(
    userId: string,
  ): Promise<{ redirectUrl: string | null; reason?: string }> {
    if (!this.documentEnabled || !this.caf.isConfigured) {
      return {
        redirectUrl: null,
        reason:
          'Verificação por documento indisponível no momento. Nossa equipe foi notificada.',
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { cpf: true, name: true, cpfIdentityVerified: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    if (user.cpfIdentityVerified) {
      // Already verified via Serpro — no need to escalate. Idempotent
      // short-circuit instead of refusing, so the UI doesn't need
      // to check state before calling.
      return { redirectUrl: null, reason: 'Identidade já verificada.' };
    }
    if (!user.cpf) {
      throw new BadRequestException(
        'Adicione um CPF antes de solicitar verificação por documento.',
      );
    }

    const session = await this.caf.createSession({
      userId,
      cpf: user.cpf,
      name: user.name,
      callbackUrl: `${this.webhookBaseUrl}/webhooks/caf`,
    });
    if (!session) {
      return {
        redirectUrl: null,
        reason:
          'Não foi possível iniciar a verificação por documento agora. Tente novamente em alguns minutos.',
      };
    }

    await this.prisma.cafVerificationSession.create({
      data: {
        userId,
        externalSessionId: session.sessionId,
        status: 'PENDING',
        redirectUrl: session.redirectUrl,
      },
    });

    return { redirectUrl: session.redirectUrl };
  }

  /**
   * Inbound webhook from Caf. Called by CafWebhookController AFTER
   * the signature has been verified against CAF_WEBHOOK_SECRET.
   *
   * Dedupe contract mirrors the Mercado Pago flow (f663e72):
   * (provider='caf', externalEventId=<session id || event id>) in
   * ProcessedWebhook. A retry lands on the P2002 branch and
   * short-circuits WITHOUT re-running side effects.
   */
  async handleCafWebhook(payload: CafWebhookPayload): Promise<{
    received: true;
    duplicate?: boolean;
  }> {
    if (!payload.sessionId || !payload.status) {
      throw new BadRequestException('Payload inválido.');
    }

    // Prefer the delivery-level eventId for dedup when Caf sends it,
    // fall back to sessionId (a status-change webhook per session
    // should only fire once for each status, so sessionId is stable
    // enough). Same pattern as the MP handler.
    const dedupKey = payload.eventId ?? payload.sessionId;

    try {
      await this.prisma.processedWebhook.create({
        data: {
          provider: 'caf',
          externalEventId: dedupKey,
          action: payload.status,
        },
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'P2002') {
        this.logger.log(
          `Caf webhook duplicate — already processed caf:${dedupKey}`,
        );
        return { received: true, duplicate: true };
      }
      throw err;
    }

    const session = await this.prisma.cafVerificationSession.findUnique({
      where: { externalSessionId: payload.sessionId },
    });
    if (!session) {
      // We got a webhook for a session we don't own. Could be a
      // Caf-side bug or a cross-tenant mix-up. Log loudly and
      // return 200 — we've already recorded the ProcessedWebhook
      // row, so a retry would also no-op.
      this.logger.warn(
        `Caf webhook references unknown session ${payload.sessionId}`,
      );
      return { received: true };
    }

    const nextStatus = normaliseCafStatus(payload.status);
    const cpfHash = await this.hashUserCpf(session.userId);

    if (nextStatus === 'APPROVED') {
      await this.prisma.$transaction([
        this.prisma.cafVerificationSession.update({
          where: { id: session.id },
          data: { status: 'APPROVED', completedAt: new Date() },
        }),
        this.prisma.user.update({
          where: { id: session.userId },
          data: { cpfIdentityVerified: true },
        }),
        this.prisma.cpfVerificationLog.create({
          data: {
            userId: session.userId,
            cpfHash,
            provider: 'CAF',
            result: 'VERIFIED',
          },
        }),
      ]);
      this.logger.log(
        `User ${session.userId} cpfIdentityVerified via Caf (session ${session.externalSessionId})`,
      );
    } else {
      // REJECTED / EXPIRED — record the outcome but don't flip
      // the flag. Log row uses the Serpro-compatible taxonomy so
      // the same dashboards work.
      await this.prisma.$transaction([
        this.prisma.cafVerificationSession.update({
          where: { id: session.id },
          data: { status: nextStatus, completedAt: new Date() },
        }),
        this.prisma.cpfVerificationLog.create({
          data: {
            userId: session.userId,
            cpfHash,
            provider: 'CAF',
            result: nextStatus === 'EXPIRED' ? 'PROVIDER_ERROR' : 'NAME_MISMATCH',
          },
        }),
      ]);
    }

    return { received: true };
  }

  private async hashUserCpf(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { cpf: true },
    });
    if (!user?.cpf) {
      // Defensive fallback — should never hit; session row
      // implies a CPF existed at session creation time.
      return 'UNKNOWN_CPF';
    }
    return this.hashCpf(user.cpf);
  }

  private hashCpf(cpf: string): string {
    return crypto
      .createHash('sha256')
      .update(cpf.replace(/\D/g, ''))
      .digest('hex');
  }

  private async logAttempt(
    userId: string,
    cpfHash: string,
    provider: string,
    result: SerproResult,
  ): Promise<void> {
    try {
      await this.prisma.cpfVerificationLog.create({
        data: { userId, cpfHash, provider, result },
      });
    } catch (err) {
      // Logging failure must never break the KYC flow. A missed log
      // row is an observability gap, not a user-facing failure.
      this.logger.warn(
        `failed to write CpfVerificationLog for ${userId}: ${String(err).slice(0, 200)}`,
      );
    }
  }
}

/** Narrow the Caf webhook's claimed status to our stored enum. Caf
 *  sometimes emits lowercase; normalise defensively so a casing
 *  change on their side doesn't quietly skip approval. */
function normaliseCafStatus(
  raw: CafWebhookDecision | string,
): 'APPROVED' | 'REJECTED' | 'EXPIRED' {
  const v = String(raw).toUpperCase();
  if (v === 'APPROVED') return 'APPROVED';
  if (v === 'EXPIRED') return 'EXPIRED';
  // Anything we don't explicitly recognise (REJECTED, MANUAL_REVIEW,
  // etc.) falls into REJECTED — never auto-flip the flag on an
  // unrecognised signal.
  return 'REJECTED';
}

