import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { isValidCPF } from '@vintage/shared';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
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
        wallet: { create: {} },
      },
    });

    return this.generateTokens(user.id);
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

    return this.generateTokens(user.id);
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
