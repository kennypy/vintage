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

  constructor(
    private readonly prisma: PrismaService,
    private readonly serpro: SerproClient,
    config: ConfigService,
  ) {
    const raw = config
      .get<string>('IDENTITY_VERIFICATION_ENABLED', 'false')
      .toLowerCase();
    this.enforceEnabled = raw === 'true' || raw === '1' || raw === 'yes';

    if (!this.enforceEnabled) {
      this.logger.warn(
        'IDENTITY_VERIFICATION_ENABLED=false — verifyCpf will short-circuit with CONFIG_ERROR. Flip to true when the Serpro contract is active.',
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
