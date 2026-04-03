import { Controller, Post, Get, Body, UseGuards, Req, Res, BadRequestException, UnauthorizedException, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyTwoFaDto, ConfirmLoginTwoFaDto } from './dto/two-fa.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { GoogleProfile } from './google.strategy';
import { AppleStrategy } from './apple.strategy';
import { CsrfMiddleware } from '../common/middleware/csrf.middleware';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private appleStrategy: AppleStrategy,
    private csrfMiddleware: CsrfMiddleware,
  ) {}

  @Get('csrf-token')
  @ApiOperation({ summary: 'Obter token CSRF para requisições mutáveis' })
  @ApiResponse({ status: 200, description: 'Token CSRF gerado' })
  getCsrfToken() {
    return { csrfToken: this.csrfMiddleware.generateToken() };
  }

  @Post('register')
  @ApiOperation({ summary: 'Cadastrar novo usuário' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Entrar na conta (retorna requiresTwoFa:true se 2FA ativo)' })
  login(
    @Body() dto: LoginDto,
    @Req() req: { ip?: string; headers: Record<string, string | undefined> },
    @Headers('x-device-id') rawDeviceId?: string,
    @Headers('x-platform') platform?: string,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string | undefined) ?? req.ip ?? '';
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
    const deviceIdHash = rawDeviceId
      ? crypto.createHash('sha256').update(rawDeviceId).digest('hex')
      : undefined;
    return this.authService.login(dto, ipHash, deviceIdHash, platform);
  }

  @Post('2fa/confirm-login')
  @ApiOperation({ summary: 'Confirmar login com código 2FA (após requiresTwoFa:true)' })
  confirmLoginWithTwoFa(@Body() dto: ConfirmLoginTwoFaDto) {
    return this.authService.confirmLoginWithTwoFa(dto.tempToken, dto.token);
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Iniciar configuração do 2FA — retorna QR code e chave secreta' })
  setupTwoFa(@CurrentUser() user: AuthUser) {
    return this.authService.setupTwoFa(user.id);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ativar 2FA verificando o primeiro código TOTP' })
  enableTwoFa(@CurrentUser() user: AuthUser, @Body() dto: VerifyTwoFaDto) {
    return this.authService.enableTwoFa(user.id, dto.token);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Desativar 2FA (requer código TOTP atual)' })
  disableTwoFa(@CurrentUser() user: AuthUser, @Body() dto: VerifyTwoFaDto) {
    return this.authService.disableTwoFa(user.id, dto.token);
  }

  @Get('security-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Status de segurança — Conta Protegida, 2FA, acessos recentes' })
  getSecurityStatus(@CurrentUser() user: AuthUser) {
    return this.authService.getSecurityStatus(user.id);
  }

  @Post('refresh')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Renovar token de acesso (requer refresh token)' })
  refresh(@Req() req: { headers: Record<string, string | undefined> }) {
    const authHeader = req.headers['authorization'] ?? '';
    const rawToken = authHeader.replace('Bearer ', '');
    if (!rawToken) {
      throw new UnauthorizedException('Token ausente');
    }
    return this.authService.refreshToken(rawToken);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Iniciar login com Google' })
  googleAuth() {
    // Guard redirects to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Callback do Google OAuth' })
  async googleCallback(
    @Req() req: { user: GoogleProfile },
    @Res() res: Response,
  ) {
    const result = await this.authService.socialLogin('google', req.user);
    res.json(result);
  }

  @Post('apple/callback')
  @ApiOperation({ summary: 'Callback do Apple Sign In' })
  async appleCallback(
    @Body() body: { identityToken: string; name?: string },
  ) {
    if (!body.identityToken) {
      throw new BadRequestException('Token de identidade Apple é obrigatório');
    }

    const profile = await this.appleStrategy.verifyIdentityToken(
      body.identityToken,
      body.name,
    );

    return this.authService.socialLogin('apple', profile);
  }

  @Post('google/token')
  @ApiOperation({ summary: 'Login com Google via ID token (mobile)' })
  async googleTokenAuth(@Body() body: { idToken: string }) {
    if (!body.idToken) {
      throw new BadRequestException('ID token do Google é obrigatório');
    }
    const profile = await this.authService.verifyGoogleIdToken(body.idToken);
    return this.authService.socialLogin('google', profile);
  }

  @Post('admin-setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bootstrap: promover usuário autenticado a ADMIN (requer ADMIN_SETUP_KEY)' })
  adminSetup(
    @CurrentUser() user: AuthUser,
    @Body() body: { setupKey: string },
  ) {
    return this.authService.adminSetup(user.id, body.setupKey);
  }
}
