import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
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

    const tokens = this.generateTokens(user.id);

    // Send welcome email (non-blocking, non-critical)
    this.emailService.sendWelcomeEmail(user.email, user.name);

    return tokens;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    if (user.isBanned) {
      throw new UnauthorizedException('Sua conta foi suspensa. Entre em contato com o suporte.');
    }

    return this.generateTokens(user.id);
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

      return {
        ...this.generateTokens(existingUser.id),
        cpfVerified: existingUser.cpfVerified,
      };
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

    return {
      ...this.generateTokens(newUser.id),
      cpfVerified: false,
    };
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
}
