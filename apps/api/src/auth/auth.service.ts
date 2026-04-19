import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { TOTP, generateSecret as totpGenerateSecret, generateURI, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { SmsService } from '../sms/sms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../common/services/redis.service';
import { CpfVaultService } from '../common/services/cpf-vault.service';
import { MetricsService } from '../metrics/metrics.service';
import { AnalyticsService, AnalyticsEvents } from '../analytics/analytics.service';
import { isValidCPF } from '@vintage/shared';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

/** 2FA brute-force lockout: after N wrong codes, block for M minutes. */
const TWOFA_MAX_ATTEMPTS = 10;
const TWOFA_LOCK_TTL_SECONDS = 30 * 60; // 30 min
const TWOFA_ATTEMPTS_TTL_SECONDS = 60 * 60; // attempt counter expires in 1h
const NEW_DEVICE_DEBOUNCE_TTL_SECONDS = 60 * 60; // 1h debounce per device

/** SMS 2FA: OTP lifetime and resend throttle. */
const SMS_CODE_TTL_SECONDS = 5 * 60; // 5 min
const SMS_RESEND_COOLDOWN_SECONDS = 30; // 30 s between sends to same user
const SMS_MAX_SENDS_PER_HOUR = 5; // hard ceiling to control cost + abuse

/**
 * Per-email login brute-force lockout. Kicks in AFTER the global per-IP rate
 * limit and captcha, so an attacker rotating IPs (credential stuffing at
 * scale) still gets stopped cold once they've guessed wrong N times on one
 * account. Counter TTL is rolling: each failure refreshes the window.
 *
 * Self-DoS risk: a troll who knows a victim's email can lock them out for
 * 30 min. Acceptable because the user can bypass the lock via password
 * reset (which clears the counter) — documented in the UX copy.
 */
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_LOCK_TTL_SECONDS = 30 * 60;
const LOGIN_ATTEMPTS_TTL_SECONDS = 60 * 60;

/**
 * Pre-computed bcrypt hash used to run a comparison even on unknown-email
 * logins. Without this, response time leaks whether the email exists
 * (unknown email → no bcrypt, fast; known email → bcrypt, slow). The cost
 * factor MUST match the register path (12) so both paths take the same
 * wall time.
 */
const DUMMY_BCRYPT_HASH =
  '$2b$12$CwTycUXWue0Thq9StjUM0u4vB8nPDC2b2M6iPOFSZa.KJSfIZbyha';

/** Hard ceiling on external OAuth verification calls (Google tokeninfo). */
const GOOGLE_TOKENINFO_TIMEOUT_MS = 3000;

/** Email verification token lifetime — long enough to survive an inbox
 *  delay, short enough that an intercepted email isn't a long-lived key.
 */
const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
/** Throttle for /auth/request-email-verification (per-user). Prevents
 *  email-flooding a victim by repeatedly registering their address. */
const EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;
const EMAIL_VERIFICATION_MAX_PER_HOUR = 5;

/**
 * Password-reset email throttle (pen-test track 3, finding A-04). The
 * controller-level @Throttle is per-IP only; an attacker rotating
 * residential proxies could happily flood a victim's inbox with reset
 * emails (5 per IP × N IPs) and inflate the PasswordResetToken table
 * indefinitely. These are per-USER (sha256(email)) Redis counters that
 * survive IP rotation. Numbers match the email-verification pair so
 * the UX is uniform.
 */
const PASSWORD_RESET_COOLDOWN_SECONDS = 60;
const PASSWORD_RESET_MAX_PER_HOUR = 5;

/**
 * Refresh-token rotation (P-07). Every successful /auth/refresh mints a
 * new row and marks the presented row `usedAt = now`. If a caller ever
 * presents a row whose `usedAt` is already set, we treat that as a theft
 * event: every outstanding refresh token for that user is revoked and
 * their `tokenVersion` is bumped so any access tokens minted before now
 * stop verifying. 7-day rolling expiry keeps the database bounded.
 */
const REFRESH_TOKEN_BYTES = 48; // 64 base64url chars; well above brute-force range
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Optional request context passed through token issuance so the
 *  RefreshToken row records which device/IP the session started from.
 *  Everything on it is client-supplied — never used as authentication,
 *  only as evidence when triaging a suspected theft. */
export interface TokenIssueContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface SocialProfile {
  email: string;
  name: string;
  avatarUrl?: string;
  providerId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private emailService: EmailService,
    private smsService: SmsService,
    private notificationsService: NotificationsService,
    private redis: RedisService,
    private analytics: AnalyticsService,
    private cpfVault: CpfVaultService,
    private metrics: MetricsService,
  ) {}

  // ── 2FA brute-force helpers ───────────────────────────────────────────

  private twoFaLockKey(userId: string): string {
    return `auth:2fa:lock:${userId}`;
  }
  private twoFaAttemptsKey(userId: string): string {
    return `auth:2fa:attempts:${userId}`;
  }

  /** Reject further 2FA attempts if the account is locked. */
  private async assertNotLocked(userId: string): Promise<void> {
    const locked = await this.redis.get(this.twoFaLockKey(userId));
    if (locked) {
      throw new ForbiddenException(
        'Sua conta foi temporariamente bloqueada por tentativas excessivas. Tente novamente em 30 minutos.',
      );
    }
  }

  /** Record a failed 2FA attempt; lock account after TWOFA_MAX_ATTEMPTS. */
  private async recordTwoFaFailure(userId: string): Promise<number> {
    const count = await this.redis.incrWithTtl(
      this.twoFaAttemptsKey(userId),
      TWOFA_ATTEMPTS_TTL_SECONDS,
    );
    if (count >= TWOFA_MAX_ATTEMPTS) {
      await this.redis.setNx(this.twoFaLockKey(userId), '1', TWOFA_LOCK_TTL_SECONDS);
    }
    return count;
  }

  /** Reset attempt counter on successful verification. */
  private async resetTwoFaAttempts(userId: string): Promise<void> {
    await this.redis.del(this.twoFaAttemptsKey(userId));
    await this.redis.del(this.twoFaLockKey(userId));
  }

  /** Current Terms of Service version; mismatch on login forces re-acceptance. */
  private getCurrentTosVersion(): string {
    return this.config.get<string>('TOS_VERSION', '1.0.0');
  }

  async register(dto: RegisterDto) {
    // Enforce ToS / Privacy acceptance (required by App Store / LGPD)
    if (!dto.acceptedTos || !dto.tosVersion) {
      throw new BadRequestException(
        'Você deve aceitar os Termos de Uso e a Política de Privacidade para criar uma conta.',
      );
    }

    // Validate CPF
    const cleanCpf = dto.cpf.replace(/\D/g, '');
    if (!isValidCPF(cleanCpf)) {
      throw new ConflictException('CPF inválido');
    }

    // CPF at rest is always ciphertext (see CpfVaultService). Collision
    // check is against the lookup-hash column, which is an HMAC keyed
    // by a dedicated CPF_LOOKUP_KEY — indexable without exposing the
    // decryption key.
    const cpfLookupHash = this.cpfVault.lookupHash(cleanCpf);
    const existingByCpf = await this.prisma.user.findUnique({
      where: { cpfLookupHash },
    });
    if (existingByCpf) {
      throw new ConflictException('Email ou CPF já cadastrado');
    }

    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingByEmail) {
      const isUnverifiedSquatter =
        existingByEmail.emailVerifiedAt === null &&
        existingByEmail.socialProvider === null &&
        existingByEmail.deletedAt === null;
      if (!isUnverifiedSquatter) {
        throw new ConflictException('Email ou CPF já cadastrado');
      }
      // Wipe the squatted record so the real owner can claim the
      // address. Cascade deletes the wallet + any pending verification
      // tokens. The attacker's password hash is gone, the new
      // registration writes a fresh one.
      await this.prisma.user.delete({ where: { id: existingByEmail.id } });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create user + wallet. CPF goes in encrypted; the lookup hash
    // (HMAC-SHA256) handles the collision check + future lookups.
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        cpfEncrypted: this.cpfVault.encrypt(cleanCpf),
        cpfLookupHash,
        name: dto.name,
        phone: dto.phone ?? null,
        // Modulo-11 passed (checked above by isValidCPF). Identity
        // verification (Receita + name match) is a separate gate set
        // later by the KYC provider — see cpfIdentityVerified.
        cpfChecksumValid: true,
        acceptedTosAt: new Date(),
        acceptedTosVersion: dto.tosVersion,
        // emailVerifiedAt left null — the verification email below has
        // to be redeemed before the account can log in. Closes the
        // "register with someone else's email" attack at the source.
        wallet: { create: {} },
      },
    });

    // Issue + send the verification email. Fire-and-forget so a transient
    // SMTP outage doesn't 500 the registration — the user can request a
    // resend from the verification screen.
    this.issueEmailVerificationToken(user.id, user.email, user.name).catch(
      (err) => this.logger.warn(`verification email issue failed: ${String(err).slice(0, 200)}`),
    );

    const tokens = await this.generateTokensWithUser(user.id);

    // Send welcome email (non-blocking, non-critical)
    this.emailService.sendWelcomeEmail(user.email, user.name);

    // Analytics — fires the top of the activation funnel. Property
    // set deliberately minimal (no email / CPF / phone) — the user
    // id is the only identifier PostHog gets from us.
    this.analytics.capture(user.id, AnalyticsEvents.USER_REGISTERED, {
      hasPhone: Boolean(user.phone),
      tosVersion: dto.tosVersion,
    });

    return tokens;
  }

  /** Record a fresh ToS acceptance for an authenticated user. */
  async acceptTos(userId: string, version: string) {
    if (!version) {
      throw new BadRequestException('Versão do termo é obrigatória.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Usuário não encontrado');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        acceptedTosAt: new Date(),
        acceptedTosVersion: version,
      },
    });
    return { success: true, tosVersion: version };
  }

  // ── Email-ownership verification helpers ─────────────────────────────
  private hashVerificationToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Mint a fresh verification token, persist its hash, and send the email.
   * Used both at register-time and for /auth/request-email-verification.
   * Rate-limited per-user via Redis to stop attackers email-flooding a
   * victim by hammering /auth/request-email-verification with their id.
   */
  private async issueEmailVerificationToken(
    userId: string,
    email: string,
    name: string,
  ): Promise<void> {
    // Per-user counter — at most N issuances per hour and a short cooldown
    // between them. Both keys are scoped to the user, not the IP, since
    // the threat model is sender-flooding a victim's inbox.
    const cooldownKey = `auth:verify-email:cooldown:${userId}`;
    const claimed = await this.redis.setNx(
      cooldownKey,
      '1',
      EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    );
    if (!claimed) {
      throw new HttpException(
        'Aguarde antes de reenviar o email de verificação.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const hourKey = `auth:verify-email:hourly:${userId}`;
    const count = await this.redis.incrWithTtl(hourKey, 60 * 60);
    if (count > EMAIL_VERIFICATION_MAX_PER_HOUR) {
      throw new HttpException(
        'Limite de envios de verificação atingido. Tente novamente mais tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashVerificationToken(rawToken);
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS);

    await this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    await this.emailService.sendVerificationEmail(email, name, rawToken);
  }

  /**
   * User-initiated re-issue of the verification email (e.g. the original
   * mail got buried). Rate-limited inside issueEmailVerificationToken.
   * Returns success even when the email isn't registered so callers can't
   * use this endpoint to enumerate registered emails.
   */
  async requestEmailVerification(email: string): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (user && !user.emailVerifiedAt && !user.deletedAt) {
      try {
        await this.issueEmailVerificationToken(user.id, user.email, user.name);
      } catch (err) {
        // Swallow rate-limit + delivery errors so we don't leak account
        // state. Real users see a "check your inbox" screen regardless.
        this.logger.warn(
          `verify-email re-issue suppressed: ${String(err).slice(0, 200)}`,
        );
      }
    }
    return { success: true };
  }

  /**
   * Consume a verification token. Single-use (usedAt set), expires in 24h,
   * bumps the user's tokenVersion so any tokens minted before verification
   * are revoked (an attacker who guessed enough of the address to register
   * never gets a usable session).
   */
  async verifyEmail(rawToken: string): Promise<{ success: true; email: string }> {
    if (!rawToken || rawToken.length < 32) {
      throw new BadRequestException('Token de verificação inválido.');
    }
    const tokenHash = this.hashVerificationToken(rawToken);
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Token de verificação inválido ou expirado.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
      select: { id: true, email: true, emailVerifiedAt: true, deletedAt: true, tokenVersion: true },
    });
    if (!user || user.deletedAt) {
      throw new BadRequestException('Conta não encontrada.');
    }
    if (user.emailVerifiedAt) {
      // Already verified — mark token used so it can't be replayed and
      // return success. Idempotent from the caller's perspective.
      await this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      return { success: true, email: user.email };
    }
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date(),
          // Bump tokenVersion so any pre-verification tokens (we hand out
          // tokens at register-time so the client can show a "check your
          // email" screen) are invalidated by jwt-auth.guard.ts.
          tokenVersion: { increment: 1 },
        },
      }),
      // Revoke every live refresh-token row for consistency with the
      // tokenVersion bump — the refresh chain is DB-backed, so a stale
      // row would otherwise keep minting valid access tokens (the new
      // ones get the current tokenVersion, defeating the pre-
      // verification invalidation).
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { success: true, email: user.email };
  }

  // ── Per-email login brute-force helpers ─────────────────────────────
  private loginEmailHash(email: string): string {
    // Trim + lowercase first so casing quirks don't bifurcate the counter.
    // Hash-truncate to 16 hex chars — collision risk is negligible at our
    // scale and keeps the Redis key short.
    return crypto
      .createHash('sha256')
      .update(email.trim().toLowerCase())
      .digest('hex')
      .slice(0, 16);
  }
  private loginAttemptsKey(email: string): string {
    return `auth:login:attempts:${this.loginEmailHash(email)}`;
  }
  private loginLockKey(email: string): string {
    return `auth:login:lock:${this.loginEmailHash(email)}`;
  }
  private async assertLoginNotLocked(email: string): Promise<void> {
    const locked = await this.redis.get(this.loginLockKey(email));
    if (locked) {
      throw new ForbiddenException(
        'Conta bloqueada temporariamente por tentativas excessivas. Aguarde 30 minutos ou use "Esqueci minha senha" para redefini-la.',
      );
    }
  }
  private async recordLoginFailure(email: string): Promise<void> {
    const count = await this.redis.incrWithTtl(
      this.loginAttemptsKey(email),
      LOGIN_ATTEMPTS_TTL_SECONDS,
    );
    if (count >= LOGIN_MAX_ATTEMPTS) {
      await this.redis.setNx(this.loginLockKey(email), '1', LOGIN_LOCK_TTL_SECONDS);
      this.metrics.authLoginLocked.inc();
    }
  }
  private async resetLoginAttempts(email: string): Promise<void> {
    await this.redis.del(this.loginAttemptsKey(email));
    await this.redis.del(this.loginLockKey(email));
  }

  async login(dto: LoginDto, ipHash?: string, deviceIdHash?: string, platform?: string) {
    // Lock check runs BEFORE we look up the user so an attacker can't use
    // the lookup existence side-channel (see the dummy-hash comparison below).
    await this.assertLoginNotLocked(dto.email);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // ALWAYS run bcrypt — even on unknown emails — so response time doesn't
    // leak whether the email is registered. The dummy hash has the same
    // cost factor as real hashes (12) to keep the timing constant.
    const hashToCheck = user ? user.passwordHash : DUMMY_BCRYPT_HASH;
    const valid = await bcrypt.compare(dto.password, hashToCheck);

    if (!user || !valid) {
      // Only count failures against a real account — otherwise an attacker
      // could DOS arbitrary strangers by hammering invalid emails.
      if (user) {
        await this.recordLoginFailure(dto.email);

        // Log failed attempt for anomaly detection (fire-and-forget).
        if (ipHash) {
          (async () => {
            try {
              await this.prisma.loginEvent.create({
                data: {
                  userId: user.id,
                  ipHash,
                  deviceIdHash: deviceIdHash ?? null,
                  platform: platform ?? null,
                  success: false,
                },
              });
            } catch {
              /* never let anomaly logging break the auth response */
            }
          })();
        }
      }
      this.metrics.authLoginFailed.inc({
        reason: user ? 'wrong_password' : 'unknown_email',
      });
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    if (user.isBanned) {
      throw new UnauthorizedException('Sua conta foi suspensa. Entre em contato com o suporte.');
    }

    if (user.deletedAt) {
      throw new UnauthorizedException('Esta conta foi excluída.');
    }

    // Email-ownership gate. A null emailVerifiedAt means the user
    // registered with this email but has not proven control of the
    // mailbox. Refuse login until they redeem the verification link.
    // Returning a structured code so the client can route to the
    // "resend verification email" screen.
    if (!user.emailVerifiedAt) {
      throw new HttpException(
        {
          code: 'EMAIL_VERIFICATION_REQUIRED',
          message:
            'Confirme seu email para entrar. Reenviamos o link de verificação para sua caixa de entrada.',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Successful password match — clear the per-email failure counter so
    // the next legitimate login isn't still riding a stale count.
    await this.resetLoginAttempts(dto.email);

    // Check ToS / Privacy current version acceptance
    const currentTosVersion = this.getCurrentTosVersion();
    if (
      !user.acceptedTosAt ||
      user.acceptedTosVersion !== currentTosVersion
    ) {
      throw new HttpException(
        {
          code: 'TOS_UPDATE_REQUIRED',
          message:
            'É necessário aceitar a nova versão dos Termos de Uso e Política de Privacidade.',
          tosVersion: currentTosVersion,
        },
        HttpStatus.CONFLICT,
      );
    }

    // Log successful login and detect new device
    if (ipHash) {
      this.recordLoginAndCheckAnomaly(user.id, ipHash, deviceIdHash, platform);
    }

    // If 2FA is enabled, return a short-lived temp token instead of full tokens
    if (user.twoFaEnabled) {
      const tempToken = this.jwtService.sign(
        { sub: user.id, type: 'twofa_pending' },
        { expiresIn: '5m' },
      );
      const method = user.twoFaMethod === 'SMS' ? 'SMS' : 'TOTP';

      // SMS method: send the OTP synchronously so the user gets it in the
      // same request. If Twilio fails, bubble the error up — we've not yet
      // issued full tokens so the user can retry cleanly.
      if (method === 'SMS' && user.twoFaPhone) {
        await this.sendSmsOtp(user.id, user.twoFaPhone);
      }

      return {
        requiresTwoFa: true,
        tempToken,
        method,
        // For SMS, expose the masked target number so the UI can tell the
        // user which phone received the code. Mask all but last 4 digits.
        phoneHint:
          method === 'SMS' && user.twoFaPhone
            ? this.maskPhone(user.twoFaPhone)
            : undefined,
      };
    }

    return this.generateTokensWithUser(user.id);
  }

  /** Obfuscate a phone number for display: +55 (11) •••• 1234 */
  private maskPhone(e164: string): string {
    if (e164.length <= 4) return e164;
    const last4 = e164.slice(-4);
    return `••••${last4}`;
  }

  /** Called after login to log the event and alert on new device (fire-and-forget) */
  private recordLoginAndCheckAnomaly(
    userId: string,
    ipHash: string,
    deviceIdHash?: string,
    platform?: string,
  ) {
    (async () => {
      try {
        // Check if this device has been seen before for this user
        const isKnownDevice = deviceIdHash
          ? await this.prisma.deviceLink.findUnique({
              where: { userId_deviceId: { userId, deviceId: deviceIdHash } },
            })
          : true; // no device fingerprint — skip alert

        await this.prisma.loginEvent.create({
          data: { userId, ipHash, deviceIdHash: deviceIdHash ?? null, platform: platform ?? null, success: true },
        });

        if (!isKnownDevice && deviceIdHash) {
          // Debounce: only notify once per hour per (user, device) pair.
          const dedupeKey = `auth:newdevice:${userId}:${deviceIdHash}`;
          const claimed = await this.redis.setNx(
            dedupeKey,
            '1',
            NEW_DEVICE_DEBOUNCE_TTL_SECONDS,
          );
          if (claimed) {
            const platformLabel = platform === 'ios' ? 'iPhone' : platform === 'android' ? 'Android' : 'Web';
            await this.notificationsService.createNotification(
              userId,
              'NEW_DEVICE_LOGIN',
              'Novo acesso detectado',
              `Sua conta foi acessada de um novo dispositivo (${platformLabel}). Se não foi você, altere sua senha imediatamente.`,
              { platform: platform ?? 'unknown' },
            );
          }
        }
      } catch {
        // Never let anomaly detection break login
      }
    })();
  }

  /** Create a configured TOTP instance for a given secret */
  private makeTOTP(secret: string): TOTP {
    return new TOTP({
      secret,
      crypto: new NobleCryptoPlugin(),
      base32: new ScureBase32Plugin(),
    });
  }

  /**
   * Verify 2FA code after login — branches on method (TOTP authenticator or SMS OTP).
   *
   * Error messaging is deliberately uniform ("Código ou token inválido.") across
   * every failure path (bad tempToken, wrong tempToken type, user not found,
   * 2FA not configured, wrong code, expired code) so an attacker cannot use
   * response text to enumerate user IDs or account states.
   */
  async confirmLoginWithTwoFa(tempToken: string, code: string) {
    const UNIFORM_ERROR = 'Código ou token inválido.';

    let payload: { sub: string; type: string };
    try {
      payload = this.jwtService.verify(tempToken) as { sub: string; type: string };
    } catch {
      throw new UnauthorizedException(UNIFORM_ERROR);
    }

    if (payload.type !== 'twofa_pending') {
      throw new UnauthorizedException(UNIFORM_ERROR);
    }

    await this.assertNotLocked(payload.sub);

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    // Re-check delete/ban state on 2FA confirm. The tempToken is issued
    // before the second factor lands, so an admin who soft-deletes or
    // bans a user IN THAT 5-minute window must still kick them out
    // before tokens are minted. Pen-test track 3 finding A-06.
    if (!user || !user.twoFaEnabled || user.deletedAt || user.isBanned) {
      throw new UnauthorizedException(UNIFORM_ERROR);
    }

    const method = user.twoFaMethod;

    if (method === 'SMS') {
      const ok = await this.consumeSmsCode(user.id, code);
      if (!ok) {
        await this.recordTwoFaFailure(user.id);
        throw new UnauthorizedException(UNIFORM_ERROR);
      }
    } else {
      if (!user.twoFaSecret) {
        throw new UnauthorizedException(UNIFORM_ERROR);
      }
      const result = await this.makeTOTP(user.twoFaSecret).verify(code);
      if (!result.valid) {
        await this.recordTwoFaFailure(user.id);
        throw new UnauthorizedException(UNIFORM_ERROR);
      }
    }

    await this.resetTwoFaAttempts(user.id);
    return this.generateTokens(user.id);
  }

  /**
   * Resend the SMS OTP during login. Requires the tempToken (from the initial
   * login response) so arbitrary callers can't trigger SMS to arbitrary users.
   * Subject to SMS_RESEND_COOLDOWN_SECONDS between sends.
   */
  async resendLoginSmsCode(tempToken: string) {
    let payload: { sub: string; type: string };
    try {
      payload = this.jwtService.verify(tempToken) as { sub: string; type: string };
    } catch {
      throw new UnauthorizedException('Token temporário inválido ou expirado');
    }
    if (payload.type !== 'twofa_pending') {
      throw new UnauthorizedException('Token inválido');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.twoFaEnabled || user.twoFaMethod !== 'SMS' || !user.twoFaPhone) {
      throw new BadRequestException('SMS 2FA não está ativo para esta conta.');
    }

    await this.sendSmsOtp(user.id, user.twoFaPhone);
    return { success: true, phoneHint: this.maskPhone(user.twoFaPhone) };
  }

  /** Generate TOTP secret and return QR code data URL for the authenticator app */
  async setupTwoFa(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Usuário não encontrado');
    if (user.twoFaEnabled) throw new BadRequestException('2FA já está ativado');

    const secret = totpGenerateSecret();
    const otpAuthUrl = generateURI({
      label: user.email,
      issuer: 'Vintage.br',
      secret,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    // Store the secret (not yet enabled — activated after first verify)
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFaSecret: secret },
    });

    return { secret, qrCodeDataUrl, otpAuthUrl };
  }

  /** Verify TOTP code and enable 2FA on the account */
  async enableTwoFa(userId: string, totpCode: string) {
    await this.assertNotLocked(userId);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFaSecret) throw new BadRequestException('Execute /auth/2fa/setup primeiro');
    if (user.twoFaEnabled) throw new BadRequestException('2FA já está ativado');

    const result = await this.makeTOTP(user.twoFaSecret).verify(totpCode);
    if (!result.valid) {
      await this.recordTwoFaFailure(userId);
      throw new BadRequestException('Código 2FA inválido. Tente novamente.');
    }

    await this.resetTwoFaAttempts(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFaEnabled: true,
        twoFaMethod: 'TOTP',
        // Clear any stale SMS-method fields left over from a previous enrollment.
        twoFaPhone: null,
        twoFaPhoneVerifiedAt: null,
      },
    });

    return { success: true, message: '2FA ativado com sucesso. Guarde bem seu app autenticador.' };
  }

  /**
   * Disable 2FA. Requires a current code — TOTP for method=TOTP, or the most
   * recent SMS OTP for method=SMS (triggered via /auth/2fa/sms/send). This
   * ensures the same factor that would gate login is required to turn it off.
   */
  async disableTwoFa(userId: string, code: string) {
    await this.assertNotLocked(userId);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFaEnabled) {
      throw new BadRequestException('2FA não está ativado nesta conta');
    }

    if (user.twoFaMethod === 'SMS') {
      const ok = await this.consumeSmsCode(userId, code);
      if (!ok) {
        await this.recordTwoFaFailure(userId);
        throw new BadRequestException('Código SMS inválido ou expirado.');
      }
    } else {
      if (!user.twoFaSecret) {
        throw new BadRequestException('2FA não está ativado nesta conta');
      }
      const result = await this.makeTOTP(user.twoFaSecret).verify(code);
      if (!result.valid) {
        await this.recordTwoFaFailure(userId);
        throw new BadRequestException('Código 2FA inválido');
      }
    }

    await this.resetTwoFaAttempts(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFaEnabled: false,
        twoFaMethod: 'TOTP',
        twoFaSecret: null,
        twoFaPhone: null,
        twoFaPhoneVerifiedAt: null,
      },
    });

    return { success: true, message: '2FA desativado.' };
  }

  // ── SMS 2FA helpers ──────────────────────────────────────────────────

  private smsCodeKey(userId: string): string {
    return `auth:2fa:sms:code:${userId}`;
  }

  private smsSendCountKey(userId: string): string {
    return `auth:2fa:sms:sends:${userId}`;
  }

  private smsCooldownKey(userId: string): string {
    return `auth:2fa:sms:cooldown:${userId}`;
  }

  private hashCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  /**
   * Generate a cryptographically-random 6-digit numeric code, store its
   * hash (not the plaintext) in Redis, enforce rate limits, and send the
   * SMS via Twilio. Throws on Twilio transport failures so the caller
   * surfaces a clear error to the user.
   *
   * Fail-closed on Redis outages in production: rate limiting IS the
   * Twilio cost-control, so if we can't count we refuse to send rather
   * than allow an attacker to drain our SMS quota.
   */
  private async sendSmsOtp(userId: string, phoneE164: string): Promise<void> {
    if (!SmsService.isValidE164(phoneE164)) {
      throw new BadRequestException('Número de telefone em formato inválido.');
    }

    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'production' && !this.redis.isAvailable()) {
      this.logger.error(
        'SMS 2FA send refused: Redis unavailable — rate limiting cannot be enforced.',
      );
      throw new HttpException(
        'Serviço temporariamente indisponível. Tente novamente em instantes.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Per-user cooldown between sends (30 s).
    const cooling = await this.redis.get(this.smsCooldownKey(userId));
    if (cooling) {
      throw new HttpException(
        'Aguarde alguns segundos antes de solicitar um novo código.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Hard ceiling on sends per hour (cost + abuse control).
    const sends = await this.redis.incrWithTtl(
      this.smsSendCountKey(userId),
      60 * 60,
    );
    if (sends > SMS_MAX_SENDS_PER_HOUR) {
      throw new HttpException(
        'Limite de envios de SMS atingido. Tente novamente mais tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 6-digit numeric, zero-padded. randomInt has enough entropy for OTP.
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    // Delete-then-set so a new code always replaces any stale one (setNx
    // would leave the previous code in place).
    await this.redis.del(this.smsCodeKey(userId));
    await this.redis.setNx(
      this.smsCodeKey(userId),
      this.hashCode(code),
      SMS_CODE_TTL_SECONDS,
    );

    await this.redis.setNx(this.smsCooldownKey(userId), '1', SMS_RESEND_COOLDOWN_SECONDS);

    const body = `Vintage.br: seu código de verificação é ${code}. Expira em 5 minutos. Nunca compartilhe este código.`;
    try {
      await this.smsService.sendSms(phoneE164, body);
    } catch (err) {
      // Transport failed — clear the stored code (user can't receive it) AND
      // refund the rate-limit credit so a flaky Twilio doesn't lock out a
      // legitimate user. The cooldown key still prevents rapid retry spam.
      await this.redis.del(this.smsCodeKey(userId));
      await this.redis.decr(this.smsSendCountKey(userId));
      this.logger.error(
        `Falha ao enviar código SMS 2FA para usuário ${userId}: ${String(err).slice(0, 200)}`,
      );
      throw new HttpException(
        'Não foi possível enviar o SMS no momento. Tente novamente.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Validate a user-supplied SMS code against the stored hash. Returns true
   * if the code matches and is not expired; atomically removes the code on
   * read so two concurrent requests can't both succeed on the same OTP.
   * Does NOT touch the brute-force counter — callers are responsible for
   * invoking recordTwoFaFailure on miss.
   */
  private async consumeSmsCode(userId: string, code: string): Promise<boolean> {
    if (!/^\d{6}$/.test(code)) return false;
    // GETDEL is atomic: the losing side of a concurrent consume sees null.
    const stored = await this.redis.getDel(this.smsCodeKey(userId));
    if (!stored) return false;
    const provided = this.hashCode(code);
    const a = Buffer.from(stored, 'hex');
    const b = Buffer.from(provided, 'hex');
    if (a.length !== b.length) return false;
    // timing-safe so response time doesn't leak guess progress.
    return crypto.timingSafeEqual(a, b);
  }

  // ── SMS 2FA enrollment (authenticated user) ──────────────────────────

  /**
   * Start SMS 2FA enrollment: stores the requested phone (not yet verified),
   * sends a one-time code. Requires the account to not already have 2FA active;
   * switching from TOTP to SMS requires disabling TOTP first.
   */
  async setupSms2Fa(userId: string, phoneE164Raw: string) {
    const phone = phoneE164Raw.trim();
    if (!SmsService.isValidE164(phone)) {
      throw new BadRequestException(
        'Informe o telefone em formato E.164 (ex: +5511999998888).',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Usuário não encontrado');
    if (user.twoFaEnabled) {
      throw new BadRequestException(
        'Desative o 2FA atual antes de configurar SMS.',
      );
    }

    // Persist the phone as "pending verification" — we don't flip the
    // method/enabled flags until the user confirms the code in /enable-sms.
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFaPhone: phone,
        twoFaPhoneVerifiedAt: null,
      },
    });

    await this.sendSmsOtp(userId, phone);
    return { success: true, phoneHint: this.maskPhone(phone) };
  }

  /** Confirm the enrollment code and flip SMS 2FA on. */
  async enableSms2Fa(userId: string, code: string) {
    await this.assertNotLocked(userId);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Usuário não encontrado');
    if (user.twoFaEnabled) {
      throw new BadRequestException('2FA já está ativado.');
    }
    if (!user.twoFaPhone) {
      throw new BadRequestException('Execute /auth/2fa/sms/setup primeiro.');
    }

    const ok = await this.consumeSmsCode(userId, code);
    if (!ok) {
      await this.recordTwoFaFailure(userId);
      throw new BadRequestException('Código SMS inválido ou expirado.');
    }

    await this.resetTwoFaAttempts(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFaEnabled: true,
        twoFaMethod: 'SMS',
        twoFaSecret: null, // make sure no stale TOTP secret remains
        twoFaPhoneVerifiedAt: new Date(),
      },
    });

    return {
      success: true,
      message: '2FA por SMS ativado. A cada login você receberá um código.',
    };
  }

  /**
   * Resend the enrollment SMS (authenticated user, after /setup).
   * Distinct from resendLoginSmsCode which uses a tempToken.
   */
  async resendEnrollmentSmsCode(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFaPhone) {
      throw new BadRequestException('Execute /auth/2fa/sms/setup primeiro.');
    }
    if (user.twoFaEnabled && user.twoFaMethod === 'SMS') {
      // Already enrolled — no need to resend.
      return { success: true, alreadyEnabled: true };
    }
    await this.sendSmsOtp(userId, user.twoFaPhone);
    return { success: true, phoneHint: this.maskPhone(user.twoFaPhone) };
  }

  /** Return the user's Conta Protegida status */
  async getSecurityStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        cpfChecksumValid: true,
        cpfIdentityVerified: true,
        twoFaEnabled: true,
        twoFaMethod: true,
        twoFaPhone: true,
        verified: true,
      },
    });
    if (!user) throw new UnauthorizedException('Usuário não encontrado');

    const recentLogins = await this.prisma.loginEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { platform: true, success: true, createdAt: true },
    });

    return {
      // New fields surfaced for clients that want the full picture.
      cpfChecksumValid: user.cpfChecksumValid,
      cpfIdentityVerified: user.cpfIdentityVerified,
      // Back-compat alias for existing mobile + web releases that
      // consume `cpfVerified`. Points at the checksum bit so the
      // pre-split UX (a "CPF ok" check on the profile) still works.
      // Post Track-B, clients should migrate to cpfIdentityVerified.
      cpfVerified: user.cpfChecksumValid,
      twoFaEnabled: user.twoFaEnabled,
      twoFaMethod: user.twoFaMethod,
      twoFaPhoneHint:
        user.twoFaEnabled && user.twoFaMethod === 'SMS' && user.twoFaPhone
          ? this.maskPhone(user.twoFaPhone)
          : null,
      // Conta Protegida is the stricter trust badge — only users who
      // have BOTH passed full KYC and enabled 2FA. Before the split
      // this read the checksum bit, which any checksum-valid CPF
      // satisfied; post-Track-B it correctly requires real identity.
      isContaProtegida: user.cpfIdentityVerified && user.twoFaEnabled,
      recentLogins,
    };
  }

  async socialLogin(provider: 'google' | 'apple', profile: SocialProfile) {
    // Check if user exists with this email
    const existingUser = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });
    const currentTosVersion = this.getCurrentTosVersion();

    if (existingUser) {
      if (existingUser.isBanned) {
        throw new UnauthorizedException('Sua conta foi suspensa. Entre em contato com o suporte.');
      }
      if (existingUser.deletedAt) {
        throw new UnauthorizedException('Esta conta foi excluída.');
      }

      // OAuth account-takeover protection: only accept the token when the
      // existing user has ALREADY linked this provider with this specific
      // provider ID. Before, we silently wrote the provider fields on
      // first OAuth hit — meaning anyone who later controlled the email
      // address at Google/Apple could walk into an existing password
      // account just by clicking "Sign in with <provider>". The link flow
      // is now an authenticated, password-gated action (linkSocialProvider
      // below + POST /auth/link-social).
      const providerMatches =
        existingUser.socialProvider === provider &&
        existingUser.socialProviderId === profile.providerId;
      if (!providerMatches) {
        throw new ConflictException({
          code: 'SOCIAL_PROVIDER_LINK_REQUIRED',
          message:
            'Este email já possui uma conta. Entre com sua senha e vincule seu login social em Configurações antes de usar este método.',
          // Hint which sign-in path the user should follow. The client
          // gets `password` or whichever provider was already linked.
          registeredWith: existingUser.socialProvider ?? 'password',
        });
      }

      // Enforce ToS acceptance on login, same as password flow
      if (
        !existingUser.acceptedTosAt ||
        existingUser.acceptedTosVersion !== currentTosVersion
      ) {
        throw new HttpException(
          {
            code: 'TOS_UPDATE_REQUIRED',
            message:
              'É necessário aceitar a nova versão dos Termos de Uso e Política de Privacidade.',
            tosVersion: currentTosVersion,
          },
          HttpStatus.CONFLICT,
        );
      }

      const tokens = await this.generateTokensWithUser(existingUser.id);
      // Wire field stays `cpfVerified` for client back-compat — points
      // at the checksum bit. Clients that want the stricter post-KYC
      // signal should read cpfIdentityVerified from /auth/security-status.
      return { ...tokens, cpfVerified: existingUser.cpfChecksumValid };
    }

    // Create new user without CPF (required on first purchase).
    // First-time sign-in via OAuth is treated as implicit acceptance of the
    // current ToS version (the mobile/web flow shows the terms on the button).
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, 12);

    const newUser = await this.prisma.user.create({
      data: {
        email: profile.email,
        passwordHash,
        name: profile.name,
        avatarUrl: profile.avatarUrl ?? null,
        socialProvider: provider,
        socialProviderId: profile.providerId,
        // OAuth signup has no CPF yet — user is prompted to add
        // one before their first purchase. cpfChecksumValid stays
        // false until setCpf runs. cpfIdentityVerified independently
        // stays false until KYC.
        cpfChecksumValid: false,
        acceptedTosAt: new Date(),
        acceptedTosVersion: currentTosVersion,
        // Google / Apple already verified the email address (we refuse
        // tokens with email_verified !== true and only accept JWKS-signed
        // Apple tokens). Mark the account as verified eagerly so OAuth
        // users skip the inbox round-trip.
        emailVerifiedAt: new Date(),
        wallet: { create: {} },
      },
    });

    // Send welcome email (non-blocking, non-critical)
    this.emailService.sendWelcomeEmail(newUser.email, newUser.name);

    const tokens = await this.generateTokensWithUser(newUser.id);
    return { ...tokens, cpfVerified: false };
  }

  /**
   * Authenticated flow that lets a signed-in user link a social provider
   * to their existing account. Replaces the previous silent-merge behaviour
   * of socialLogin. Requires the account password so a stolen session can't
   * attach an attacker's Google/Apple account to the victim's login.
   *
   * The social profile is verified by the caller (controller calls
   * verifyGoogleIdToken / appleStrategy.verifyIdentityToken first) — we
   * trust it here, same as socialLogin does.
   */
  async linkSocialProvider(
    userId: string,
    password: string,
    provider: 'google' | 'apple',
    profile: SocialProfile,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Usuário não encontrado');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Senha incorreta');
    }

    // The linking flow only makes sense when the social identity the user
    // just verified at the OAuth provider matches the email on their
    // Vintage account. Otherwise we'd be linking "bob's Google" to
    // "alice@vintage.br" — an obvious identity mismatch.
    if (user.email.toLowerCase() !== profile.email.toLowerCase()) {
      throw new BadRequestException(
        'O email da sua conta não corresponde à conta social escolhida.',
      );
    }

    // Idempotent: if the same provider+providerId is already linked, this
    // is a no-op so the UI can retry without tripping.
    if (
      user.socialProvider === provider &&
      user.socialProviderId === profile.providerId
    ) {
      return { success: true, alreadyLinked: true };
    }

    // Different provider already linked — refuse rather than silently
    // overwrite. User must explicitly unlink the current one first (not
    // exposed yet; add when the feature ships).
    if (user.socialProvider && user.socialProvider !== provider) {
      throw new ConflictException(
        'Sua conta já tem outro login social vinculado. Desvincule-o antes de vincular um novo.',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        socialProvider: provider,
        socialProviderId: profile.providerId,
        avatarUrl: user.avatarUrl ?? profile.avatarUrl ?? null,
      },
    });
    return { success: true, provider };
  }

  async verifyGoogleIdToken(idToken: string): Promise<SocialProfile> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID', '');

    // Refuse to verify if no client ID is configured. Previously a deployment
    // that forgot GOOGLE_CLIENT_ID would silently SKIP the `aud` check and
    // accept tokens for any app on any project — same class of bug the Apple
    // strategy had before it grew JWKS verification.
    if (!clientId) {
      this.logger.error(
        'GOOGLE_CLIENT_ID is not set — refusing to verify Google ID tokens.',
      );
      throw new UnauthorizedException('Google Sign In não está configurado.');
    }

    // Bound the outbound call — without a timeout, a slow Google POP can
    // tie up the login handler indefinitely and drain our event-loop slots.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GOOGLE_TOKENINFO_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
        { signal: controller.signal },
      );
    } catch {
      throw new UnauthorizedException('Falha ao verificar token do Google');
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new UnauthorizedException('Token do Google inválido');
    }

    const data = await res.json() as {
      aud?: string;
      email?: string;
      email_verified?: string | boolean;
      name?: string;
      picture?: string;
      sub?: string;
    };

    if (data.aud !== clientId) {
      throw new UnauthorizedException('Token do Google inválido para este app');
    }

    // Google's tokeninfo returns email_verified="true" (string) when the
    // Google account owner has verified the email. Refuse unverified
    // emails — an attacker can create a Google account with any unverified
    // address and use it to claim a Vintage account.
    const emailVerified =
      data.email_verified === true || data.email_verified === 'true';
    if (!emailVerified) {
      throw new UnauthorizedException(
        'O email da conta Google não está verificado.',
      );
    }

    if (!data.email || !data.sub) {
      throw new UnauthorizedException('Email não disponível na conta Google');
    }

    return {
      email: data.email,
      name: data.name ?? data.email.split('@')[0],
      avatarUrl: data.picture,
      providerId: data.sub,
    };
  }

  /**
   * Change the password of an authenticated user after verifying the current password.
   * Also invalidates any outstanding reset tokens.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Usuário não encontrado');
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Senha atual incorreta');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException('A nova senha deve ser diferente da atual');
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    // Bump tokenVersion in the same UPDATE that changes the password so
    // any outstanding access/refresh tokens issued to the old password
    // are rejected by JwtStrategy on their next request. Without this,
    // an attacker who phished the old password could keep a valid
    // session going after the legitimate owner rotated it.
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    // Invalidate any outstanding reset tokens so a stolen reset link is neutralized.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    // Eagerly revoke every live refresh token. JwtStrategy would
    // reject the stale access tokens on their next request anyway
    // (tokenVersion bump), but refresh rows are DB-backed and stay
    // usable against the old `ver` claim until their own expiry —
    // flipping revokedAt closes that window immediately.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true, message: 'Senha alterada com sucesso.' };
  }

  /**
   * Issue a password-reset token and email it. Always returns a neutral success
   * message (even when the email is unknown) to prevent user enumeration.
   *
   * Per-user throttle (A-04, pen-test track 3): the controller-level
   * @Throttle keys on IP, so an attacker rotating proxies could flood
   * a victim's inbox + the PasswordResetToken table. The cooldown +
   * hourly cap below are keyed on sha256(email) and survive IP
   * rotation. Failures stay silent — we still return the neutral
   * response so the throttle isn't an enumeration oracle.
   */
  async forgotPassword(emailRaw: string) {
    const neutralResponse = {
      success: true,
      message: 'Se este email estiver cadastrado, enviaremos instruções em instantes.',
    };
    // Normalise BEFORE both the DB lookup and the throttle key. Login
    // already lowercases on its hash key; reset must too, otherwise
    // an attacker can rotate Victim@/VICTIM@/victim@ to multiply the
    // throttle bucket. The User.email column itself is stored as-is,
    // and Prisma's findUnique is case-sensitive — so DB lookups still
    // honour whatever casing the user registered with. The actual
    // collision risk is enumeration via throttle bucket, not DB miss.
    const email = (emailRaw ?? '').trim().toLowerCase();
    if (!email) return neutralResponse;
    // Throttle BEFORE the DB read so the cost of the lookup itself
    // can't be amplified by a flood.
    const userKeyHash = this.passwordResetKey(email);
    const cooldownKey = `auth:pwreset:cooldown:${userKeyHash}`;
    const cooled = await this.redis.setNx(
      cooldownKey,
      '1',
      PASSWORD_RESET_COOLDOWN_SECONDS,
    );
    if (!cooled) {
      // Silently swallow — neutral response stays (no enumeration).
      return neutralResponse;
    }
    const hourKey = `auth:pwreset:hourly:${userKeyHash}`;
    const count = await this.redis.incrWithTtl(hourKey, 60 * 60);
    if (count > PASSWORD_RESET_MAX_PER_HOUR) {
      return neutralResponse;
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt || user.isBanned) {
      return neutralResponse;
    }
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });
    // Fire-and-forget email — caller doesn't need to wait
    this.emailService.sendPasswordResetEmail(user.email, user.name, rawToken).catch(() => {
      // Logged inside the email service
    });
    return neutralResponse;
  }

  /** Hash-truncated email key for the password-reset throttle. Same shape
   *  as loginEmailHash so the keyspace is uniform. */
  private passwordResetKey(email: string): string {
    return crypto
      .createHash('sha256')
      .update(email)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Redeem a password-reset token and set a new password. Tokens are single-use
   * and expire after 1 hour. We compare by sha256 hash so the DB never stores
   * the raw token.
   *
   * Race semantics (pen-test track 3, finding A-01): two concurrent
   * resets presenting the same token used to BOTH succeed — the read
   * lived outside the $transaction and both writers fell through to
   * unconditional updates. The result was a two-bump tokenVersion, two
   * bcrypt-set passwords (last writer wins), and a phishing-friendly
   * race window where an attacker who intercepted the email could
   * out-race the legitimate user. Now the token is claimed via a
   * conditional updateMany INSIDE the transaction; only the winning
   * writer ever reaches the password update.
   */
  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Link de redefinição inválido ou expirado');
    }
    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user || user.deletedAt) {
      throw new BadRequestException('Link de redefinição inválido');
    }
    // bcrypt outside the tx so the cost (≈150ms) doesn't hold the
    // serializable lock; the claim below decides whether we actually use it.
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction(async (tx) => {
      // Atomic single-use claim. The where-clause re-checks usedAt /
      // expiresAt INSIDE the tx so a concurrent writer that also
      // passed the outer findUnique check (line above) loses cleanly:
      // updateMany returns count=0 and we throw. No password gets set
      // and no tokenVersion bump.
      const claim = await tx.passwordResetToken.updateMany({
        where: {
          id: record.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Link de redefinição inválido ou expirado');
      }
      await tx.user.update({
        where: { id: user.id },
        // Same tokenVersion bump as changePassword — password reset is
        // specifically used to kick out an attacker who knows the
        // previous password, so every outstanding session MUST die.
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      // Invalidate any other outstanding tokens for this user so a
      // duplicate reset link from the same flood can't be redeemed
      // afterwards.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null, id: { not: record.id } },
        data: { usedAt: new Date() },
      });
      // Revoke every live refresh-token row. A password reset is
      // the textbook "kick the attacker out" flow; leaving live
      // refresh rows means the attacker can still mint fresh
      // access tokens even after the reset.
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    return { success: true, message: 'Senha redefinida com sucesso.' };
  }

  /**
   * Start an email-change flow. Requires the current password as a second factor
   * (even if the user is still signed in) so a stolen session can't silently
   * redirect recovery to the attacker's inbox. The confirmation link is sent
   * to the NEW address; the old address receives a post-change notice when
   * the token is redeemed.
   */
  async requestEmailChange(userId: string, newEmailRaw: string, password: string) {
    const newEmail = newEmailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Usuário não encontrado');
    }
    if (newEmail === user.email.toLowerCase()) {
      throw new BadRequestException('O novo email é igual ao atual.');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Senha incorreta');
    }
    const taken = await this.prisma.user.findUnique({ where: { email: newEmail } });
    if (taken) {
      throw new ConflictException('Este email já está em uso.');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.$transaction([
      // Invalidate any prior in-flight email-change tokens for this user
      this.prisma.emailChangeToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.emailChangeToken.create({
        data: { userId, newEmail, tokenHash, expiresAt },
      }),
    ]);

    this.emailService
      .sendEmailChangeConfirmation(newEmail, user.name, rawToken)
      .catch((err) => {
        this.logger.error(
          `Falha ao enviar email de confirmação de alteração para ${newEmail}: ${String(err).slice(0, 200)}`,
        );
      });

    return {
      success: true,
      message: 'Enviamos um link de confirmação para o novo email.',
    };
  }

  /**
   * Redeem an email-change token. Single-use, 1-hour TTL. Also rechecks
   * uniqueness at redemption time because someone else may have claimed
   * the target address between request and confirm.
   */
  async confirmEmailChange(rawToken: string) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const record = await this.prisma.emailChangeToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Link inválido ou expirado.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user || user.deletedAt) {
      throw new BadRequestException('Link inválido.');
    }

    const clash = await this.prisma.user.findUnique({ where: { email: record.newEmail } });
    if (clash && clash.id !== user.id) {
      // Someone else grabbed the address while the user was waiting.
      await this.prisma.emailChangeToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      throw new ConflictException('Este email foi utilizado por outra conta. Solicite novamente.');
    }

    const oldEmail = user.email;
    // Same single-use-claim pattern as resetPassword (A-09 mirror of
    // A-01). Two concurrent confirmations of the same link used to
    // bump tokenVersion twice; the conditional updateMany makes only
    // one writer reach the user.update + email-change row.
    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.emailChangeToken.updateMany({
        where: {
          id: record.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Link inválido ou expirado.');
      }
      await tx.user.update({
        where: { id: user.id },
        // tokenVersion bump invalidates every outstanding access +
        // refresh token minted against the previous email. An attacker
        // who had session access to the old email (or a leaked JWT)
        // cannot keep using it once the owner confirms the change —
        // the next request hits JwtStrategy's ver check and gets a 401.
        data: { email: record.newEmail, tokenVersion: { increment: 1 } },
      });
      // Invalidate any outstanding password-reset tokens — old email no longer owns the account
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      // Revoke every live refresh-token row — email change invalidates
      // prior session context by convention, same as password change.
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    // Notify the previous address so the user can react quickly if compromised
    this.emailService
      .sendEmailChangeNoticeToOld(oldEmail, user.name, record.newEmail)
      .catch((err) => {
        this.logger.error(
          `Falha ao enviar aviso de alteração de email para ${oldEmail}: ${String(err).slice(0, 200)}`,
        );
      });

    return {
      success: true,
      message: 'Email alterado com sucesso.',
      newEmail: record.newEmail,
    };
  }

  async adminSetup(userId: string, setupKey: string) {
    const envKey = this.config.get<string>('ADMIN_SETUP_KEY');
    if (!envKey) {
      throw new BadRequestException(
        'ADMIN_SETUP_KEY não está configurada. Defina a variável de ambiente para usar este endpoint.',
      );
    }

    // Constant-time compare. The naive !== leaks a per-byte timing
    // signal that lets an attacker recover the setup key one byte at
    // a time over enough requests (pen-test track 3 finding A-10).
    // Bypassing length-mismatch fast-path with byteLength is required
    // — timingSafeEqual throws on length mismatch, which is itself a
    // length-disclosure; we collapse that to a generic 401.
    const keyBuf = Buffer.from(setupKey ?? '', 'utf8');
    const envBuf = Buffer.from(envKey, 'utf8');
    const ok =
      keyBuf.length === envBuf.length &&
      crypto.timingSafeEqual(keyBuf, envBuf);
    if (!ok) {
      throw new UnauthorizedException('Chave de setup inválida.');
    }

    // Check if any admin already exists
    const existingAdmin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });
    if (existingAdmin) {
      throw new BadRequestException(
        'Já existe um administrador. Use POST /admin/users/:id/promote para promover outros usuários.',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { role: 'ADMIN' },
    });

    return { success: true, message: 'Conta promovida a administrador.' };
  }

  /**
   * Redeem a refresh token: atomically mark it used, mint a new
   * (access, refresh) pair, and link the old row to its replacement.
   *
   * Reuse detection: if the token's hash exists but `usedAt` is already
   * set (or the row is revoked), we treat that as an active theft — the
   * legitimate client has already rotated past this token, so anyone
   * replaying it has a copy they shouldn't. We then nuke every
   * outstanding refresh token for that user AND bump `tokenVersion` so
   * in-flight access tokens stop verifying on the next request. This is
   * the OWASP-recommended pattern for rotating refresh tokens.
   */
  async refreshToken(rawToken: string, ctx: TokenIssueContext = {}) {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 32) {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
    const tokenHash = this.hashRefreshToken(rawToken);

    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!record) {
      // Unknown hash. Either a fake token or one we've already garbage-
      // collected. Indistinguishable to the caller — same 401.
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    // Reuse detection. A used-or-revoked row replayed = theft.
    if (record.usedAt || record.revokedAt) {
      await this.handleRefreshTokenReuse(record.userId, record.id);
      throw new UnauthorizedException(
        'Sessão invalidada por suspeita de reutilização do token. Entre novamente.',
      );
    }

    if (record.expiresAt < new Date()) {
      // Expired but not yet used — just a stale client. Clean 401, no
      // theft signal.
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    // Mark the row used atomically. If two concurrent /refresh calls
    // race with the same token, exactly one updateMany returns count=1;
    // the loser sees count=0 and is indistinguishable from a reuse
    // attempt, which is correct — the loser's copy of the token was
    // stolen, replayed, or is a latent double-tap. Tripping the theft
    // response on a genuine double-tap is acceptable (rare, user just
    // has to log in again).
    const claim = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, usedAt: null, revokedAt: null },
      data: { usedAt: new Date() },
    });
    if (claim.count !== 1) {
      await this.handleRefreshTokenReuse(record.userId, record.id);
      throw new UnauthorizedException(
        'Sessão invalidada por suspeita de reutilização do token. Entre novamente.',
      );
    }

    const newTokens = await this.generateTokens(record.userId, ctx);

    // Breadcrumb: link the used row to its replacement so a future
    // theft-triage session can reconstruct the chain.
    const replacement = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashRefreshToken(newTokens.refreshToken) },
      select: { id: true },
    });
    if (replacement) {
      await this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { replacedById: replacement.id },
      });
    }

    return newTokens;
  }

  /**
   * Revocation sweep triggered when a used/revoked refresh token is
   * replayed. Two moves in one transaction:
   *   1. Revoke every outstanding refresh row for the user (so any other
   *      live client is kicked to re-auth; the attacker loses as much
   *      ground as the legitimate user did).
   *   2. Bump `tokenVersion`, which invalidates every already-minted
   *      access token the moment it reaches JwtStrategy.
   */
  private async handleRefreshTokenReuse(
    userId: string,
    presentedRowId: string,
  ): Promise<void> {
    this.logger.warn(
      `Refresh-token reuse detected for user ${userId} (row ${presentedRowId}) — revoking all sessions.`,
    );
    this.metrics.authRefreshReuse.inc();
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      }),
    ]);
  }

  /**
   * Hash helper for refresh tokens. SHA-256 is fine here because the
   * raw token is 48 random bytes — no dictionary attack surface, no
   * bcrypt cost needed. Storing only the hash means a DB dump can't
   * be turned back into live credentials.
   */
  private hashRefreshToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Revoke a specific refresh token (logout flow). Idempotent — an
   * unknown or already-revoked token returns silently so /auth/logout
   * can't be used to enumerate valid tokens.
   */
  async revokeRefreshToken(rawToken: string): Promise<void> {
    if (!rawToken || typeof rawToken !== 'string') return;
    const tokenHash = this.hashRefreshToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Mint an access + refresh token pair bound to the user's current
   * tokenVersion. JwtStrategy checks that `ver` matches on every
   * authenticated request; the refresh endpoint goes through
   * refreshToken() above, which additionally enforces single-use
   * rotation against the RefreshToken table.
   */
  private async generateTokens(userId: string, ctx: TokenIssueContext = {}) {
    // Read tokenVersion as part of the same boot path so access + refresh
    // agree. A concurrent email-change / password-change that bumps the
    // version between issuance would normally leave one of them stale;
    // reading once is the cheapest way to keep them in lock-step.
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tokenVersion: true },
    });
    if (!u) throw new UnauthorizedException('Usuário não encontrado');
    const ver = u.tokenVersion;

    const accessToken = this.jwtService.sign({ sub: userId, ver });

    // Opaque, random, server-tracked refresh token. No JWT envelope —
    // clients just stash the string and hand it back on /auth/refresh;
    // they never need to parse it. 48 random bytes → 64 base64url chars,
    // well beyond any brute-force regime.
    const rawRefresh = crypto
      .randomBytes(REFRESH_TOKEN_BYTES)
      .toString('base64url');
    const tokenHash = this.hashRefreshToken(rawRefresh);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        // Context is evidence-only — never trusted for authorization.
        // Trim to keep the row bounded when clients send ridiculous UAs.
        userAgent: ctx.userAgent?.slice(0, 512) ?? null,
        ipAddress: ctx.ipAddress?.slice(0, 64) ?? null,
      },
    });

    return { accessToken, refreshToken: rawRefresh };
  }

  /** Returns tokens + the user object expected by the mobile client. */
  private async generateTokensWithUser(
    userId: string,
    ctx: TokenIssueContext = {},
  ) {
    const tokens = await this.generateTokens(userId, ctx);
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        cpfEncrypted: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
    // Decrypt CPF at the service boundary — the mobile + web clients
    // expect the `cpf` field on the login/register response, not an
    // encrypted blob. CPF only leaves the server when the owner of
    // the account is reading it.
    const { cpfEncrypted, ...rest } = row ?? {};
    const cpf = cpfEncrypted ? this.cpfVault.decrypt(cpfEncrypted) : null;
    return { ...tokens, user: row ? { ...rest, cpf } : null };
  }
}
