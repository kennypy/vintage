import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { TOTP, generateSecret as totpGenerateSecret, generateURI, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isValidCPF } from '@vintage/shared';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

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
  ) {}

  async register(dto: RegisterDto) {
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
        wallet: { create: {} },
      },
    });

    const tokens = await this.generateTokensWithUser(user.id);

    // Send welcome email (non-blocking, non-critical)
    this.emailService.sendWelcomeEmail(user.email, user.name);

    return tokens;
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
      // Log failed attempt for anomaly detection (fire-and-forget)
      if (ipHash) {
        this.prisma.loginEvent.create({
          data: { userId: user.id, ipHash, deviceIdHash: deviceIdHash ?? null, platform: platform ?? null, success: false },
        }).catch(() => {});
      }
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    if (user.isBanned) {
      throw new UnauthorizedException('Sua conta foi suspensa. Entre em contato com o suporte.');
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
          // Alert user of new device login
          const platformLabel = platform === 'ios' ? 'iPhone' : platform === 'android' ? 'Android' : 'Web';
          await this.notificationsService.createNotification(
            userId,
            'NEW_DEVICE_LOGIN',
            'Novo acesso detectado',
            `Sua conta foi acessada de um novo dispositivo (${platformLabel}). Se não foi você, altere sua senha imediatamente.`,
            { platform: platform ?? 'unknown' },
          );
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

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.twoFaEnabled || !user.twoFaSecret) {
      throw new UnauthorizedException('2FA não configurado');
    }

    const result = await this.makeTOTP(user.twoFaSecret).verify(totpCode);
    if (!result.valid) {
      throw new UnauthorizedException('Código 2FA inválido');
    }

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
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFaSecret) throw new BadRequestException('Execute /auth/2fa/setup primeiro');
    if (user.twoFaEnabled) throw new BadRequestException('2FA já está ativado');

    const result = await this.makeTOTP(user.twoFaSecret).verify(totpCode);
    if (!result.valid) throw new BadRequestException('Código 2FA inválido. Tente novamente.');

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFaEnabled: true },
    });

    return { success: true, message: '2FA ativado com sucesso. Guarde bem seu app autenticador.' };
  }

  /** Disable 2FA — requires current TOTP code for confirmation */
  async disableTwoFa(userId: string, totpCode: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFaEnabled || !user.twoFaSecret) {
      throw new BadRequestException('2FA não está ativado nesta conta');
    }

    const result = await this.makeTOTP(user.twoFaSecret).verify(totpCode);
    if (!result.valid) throw new BadRequestException('Código 2FA inválido');

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

    if (existingUser) {
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

      const tokens = await this.generateTokensWithUser(existingUser.id);
      return { ...tokens, cpfVerified: existingUser.cpfVerified };
    }

    // Create new user without CPF (required on first purchase)
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

  async refreshToken(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
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
