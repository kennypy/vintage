import {
  Injectable,
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
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../common/services/redis.service';
import { isValidCPF } from '@vintage/shared';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

/** 2FA brute-force lockout: after N wrong codes, block for M minutes. */
const TWOFA_MAX_ATTEMPTS = 10;
const TWOFA_LOCK_TTL_SECONDS = 30 * 60; // 30 min
const TWOFA_ATTEMPTS_TTL_SECONDS = 60 * 60; // attempt counter expires in 1h
const NEW_DEVICE_DEBOUNCE_TTL_SECONDS = 60 * 60; // 1h debounce per device

export interface SocialProfile {
  email: string;
  name: string;
  avatarUrl?: string;
  providerId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
    private redis: RedisService,
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

    // Check uniqueness
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { cpf: cleanCpf }] },
    });
    if (existing) {
      throw new ConflictException('Email ou CPF já cadastrado');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create user + wallet
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        cpf: cleanCpf,
        name: dto.name,
        phone: dto.phone ?? null,
        cpfVerified: true,
        acceptedTosAt: new Date(),
        acceptedTosVersion: dto.tosVersion,
        wallet: { create: {} },
      },
    });

    const tokens = await this.generateTokensWithUser(user.id);

    // Send welcome email (non-blocking, non-critical)
    this.emailService.sendWelcomeEmail(user.email, user.name);

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

  async login(dto: LoginDto, ipHash?: string, deviceIdHash?: string, platform?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      // Log failed attempt for anomaly detection (fire-and-forget).
      // Use async IIFE + try/catch to guard against both synchronous errors
      // (e.g. loginEvent undefined when Prisma client is stale) and async ones.
      if (ipHash) {
        (async () => {
          try {
            await this.prisma.loginEvent.create({
              data: { userId: user.id, ipHash, deviceIdHash: deviceIdHash ?? null, platform: platform ?? null, success: false },
            });
          } catch { /* never let anomaly logging break the auth response */ }
        })();
      }
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    if (user.isBanned) {
      throw new UnauthorizedException('Sua conta foi suspensa. Entre em contato com o suporte.');
    }

    if (user.deletedAt) {
      throw new UnauthorizedException('Esta conta foi excluída.');
    }

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
      return { requiresTwoFa: true, tempToken };
    }

    return this.generateTokensWithUser(user.id);
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

  /** Verify TOTP code after login when 2FA is required */
  async confirmLoginWithTwoFa(tempToken: string, totpCode: string) {
    let payload: { sub: string; type: string };
    try {
      payload = this.jwtService.verify(tempToken) as { sub: string; type: string };
    } catch {
      throw new UnauthorizedException('Token temporário inválido ou expirado');
    }

    if (payload.type !== 'twofa_pending') {
      throw new UnauthorizedException('Token inválido');
    }

    await this.assertNotLocked(payload.sub);

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.twoFaEnabled || !user.twoFaSecret) {
      throw new UnauthorizedException('2FA não configurado');
    }

    const result = await this.makeTOTP(user.twoFaSecret).verify(totpCode);
    if (!result.valid) {
      await this.recordTwoFaFailure(user.id);
      throw new UnauthorizedException('Código 2FA inválido');
    }

    await this.resetTwoFaAttempts(user.id);
    return this.generateTokens(user.id);
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
      data: { twoFaEnabled: true },
    });

    return { success: true, message: '2FA ativado com sucesso. Guarde bem seu app autenticador.' };
  }

  /** Disable 2FA — requires current TOTP code for confirmation */
  async disableTwoFa(userId: string, totpCode: string) {
    await this.assertNotLocked(userId);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFaEnabled || !user.twoFaSecret) {
      throw new BadRequestException('2FA não está ativado nesta conta');
    }

    const result = await this.makeTOTP(user.twoFaSecret).verify(totpCode);
    if (!result.valid) {
      await this.recordTwoFaFailure(userId);
      throw new BadRequestException('Código 2FA inválido');
    }

    await this.resetTwoFaAttempts(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFaEnabled: false, twoFaSecret: null },
    });

    return { success: true, message: '2FA desativado.' };
  }

  /** Return the user's Conta Protegida status */
  async getSecurityStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { cpfVerified: true, twoFaEnabled: true, verified: true },
    });
    if (!user) throw new UnauthorizedException('Usuário não encontrado');

    const recentLogins = await this.prisma.loginEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { platform: true, success: true, createdAt: true },
    });

    return {
      cpfVerified: user.cpfVerified,
      twoFaEnabled: user.twoFaEnabled,
      isContaProtegida: user.cpfVerified && user.twoFaEnabled,
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

      // Update social provider info if not already set
      if (!existingUser.socialProvider) {
        await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            socialProvider: provider,
            socialProviderId: profile.providerId,
            avatarUrl: existingUser.avatarUrl ?? profile.avatarUrl ?? null,
          },
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
      return { ...tokens, cpfVerified: existingUser.cpfVerified };
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
        cpfVerified: false,
        acceptedTosAt: new Date(),
        acceptedTosVersion: currentTosVersion,
        wallet: { create: {} },
      },
    });

    // Send welcome email (non-blocking, non-critical)
    this.emailService.sendWelcomeEmail(newUser.email, newUser.name);

    const tokens = await this.generateTokensWithUser(newUser.id);
    return { ...tokens, cpfVerified: false };
  }

  async verifyGoogleIdToken(idToken: string): Promise<SocialProfile> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID', '');

    let res: Response;
    try {
      res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      );
    } catch {
      throw new UnauthorizedException('Falha ao verificar token do Google');
    }

    if (!res.ok) {
      throw new UnauthorizedException('Token do Google inválido');
    }

    const data = await res.json() as {
      aud?: string;
      email?: string;
      name?: string;
      picture?: string;
      sub?: string;
    };

    if (clientId && data.aud !== clientId) {
      throw new UnauthorizedException('Token do Google inválido para este app');
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
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    // Invalidate any outstanding reset tokens so a stolen reset link is neutralized.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    return { success: true, message: 'Senha alterada com sucesso.' };
  }

  /**
   * Issue a password-reset token and email it. Always returns a neutral success
   * message (even when the email is unknown) to prevent user enumeration.
   */
  async forgotPassword(email: string) {
    const neutralResponse = {
      success: true,
      message: 'Se este email estiver cadastrado, enviaremos instruções em instantes.',
    };
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

  /**
   * Redeem a password-reset token and set a new password. Tokens are single-use
   * and expire after 1 hour. We compare by sha256 hash so the DB never stores
   * the raw token.
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
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate any other outstanding tokens for this user
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null, id: { not: record.id } },
        data: { usedAt: new Date() },
      }),
    ]);
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
      .catch(() => { /* logged in email service */ });

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
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { email: record.newEmail },
      }),
      this.prisma.emailChangeToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate any outstanding password-reset tokens — old email no longer owns the account
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    // Notify the previous address so the user can react quickly if compromised
    this.emailService
      .sendEmailChangeNoticeToOld(oldEmail, user.name, record.newEmail)
      .catch(() => { /* logged in email service */ });

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

    if (setupKey !== envKey) {
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

  async refreshToken(rawToken: string) {
    let payload: { sub: string; type?: string };
    try {
      payload = this.jwtService.verify(rawToken) as { sub: string; type?: string };
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Token inválido para renovação — use o refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }
    return this.generateTokens(user.id);
  }

  private generateTokens(userId: string) {
    const accessToken = this.jwtService.sign({ sub: userId });

    const refreshExpiry = this.config.get<string>('JWT_REFRESH_EXPIRY', '7d');
    const refreshToken = this.jwtService.sign({ sub: userId, type: 'refresh' }, { expiresIn: refreshExpiry });

    return { accessToken, refreshToken };
  }

  /** Returns tokens + the user object expected by the mobile client. */
  private async generateTokensWithUser(userId: string) {
    const tokens = this.generateTokens(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, cpf: true, avatarUrl: true, createdAt: true },
    });
    return { ...tokens, user };
  }
}
