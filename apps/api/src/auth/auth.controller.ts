import { Controller, Post, Get, Body, UseGuards, Req, Res, BadRequestException, UnauthorizedException, Headers } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  clearSessionCookies,
  parseExpiryToSeconds,
  resolveCookieConfig,
  setSessionCookies,
  type SessionCookieConfig,
} from './cookie.constants';
import {
  VerifyTwoFaDto,
  ConfirmLoginTwoFaDto,
  ResendLoginSmsDto,
  SetupSmsDto,
  LinkSocialDto,
} from './dto/two-fa.dto';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  RequestEmailVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/password.dto';
import { RequestEmailChangeDto, ConfirmEmailChangeDto } from './dto/email-change.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CaptchaGuard } from './captcha.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { GoogleProfile } from './google.strategy';
import { AppleStrategy } from './apple.strategy';
import { CsrfMiddleware } from '../common/middleware/csrf.middleware';

/** 2FA endpoints: 5 requests per 15 minutes (per tracker, typically IP or API key). */
const TWOFA_THROTTLE = { default: { limit: 5, ttl: 15 * 60 * 1000 } };

/** Password reset endpoints: 5 requests per 15 minutes to prevent enumeration spam. */
const PASSWORD_THROTTLE = { default: { limit: 5, ttl: 15 * 60 * 1000 } };

/**
 * Login endpoint: tight per-tracker (per-IP or per-API-key) throttle to cap
 * credential-stuffing from a single origin. Complements the per-email
 * progressive lockout inside AuthService.login, which survives attackers
 * rotating IPs.
 */
const LOGIN_THROTTLE = { default: { limit: 10, ttl: 15 * 60 * 1000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly cookieConfig: SessionCookieConfig;
  private readonly accessCookieMaxSeconds: number;
  private readonly refreshCookieMaxSeconds: number;

  constructor(
    private authService: AuthService,
    private appleStrategy: AppleStrategy,
    private csrfMiddleware: CsrfMiddleware,
    config: ConfigService,
  ) {
    this.cookieConfig = resolveCookieConfig(config);
    this.accessCookieMaxSeconds = parseExpiryToSeconds(
      config.get<string>('JWT_EXPIRY'),
      15 * 60,
    );
    this.refreshCookieMaxSeconds = parseExpiryToSeconds(
      config.get<string>('JWT_REFRESH_EXPIRY'),
      7 * 24 * 60 * 60,
    );
  }

  /**
   * Inspect a service result and, when it carries access+refresh tokens,
   * write them into the HttpOnly session + refresh cookies. Lets the web
   * client stop touching tokens entirely (they live in HttpOnly cookies
   * the JS can't read) while mobile keeps reading them from the response
   * body — same response shape, opt-in storage transport per client.
   */
  private maybeSetSessionCookies(res: Response, result: unknown): void {
    if (!result || typeof result !== 'object') return;
    const r = result as { accessToken?: unknown; refreshToken?: unknown };
    if (typeof r.accessToken === 'string' && typeof r.refreshToken === 'string') {
      setSessionCookies(
        res,
        r.accessToken,
        r.refreshToken,
        this.cookieConfig,
        this.accessCookieMaxSeconds,
        this.refreshCookieMaxSeconds,
      );
    }
  }

  @Get('csrf-token')
  @ApiOperation({ summary: 'Obter token CSRF para requisições mutáveis' })
  @ApiResponse({ status: 200, description: 'Token CSRF gerado' })
  getCsrfToken() {
    return { csrfToken: this.csrfMiddleware.generateToken() };
  }

  @Post('register')
  @UseGuards(CaptchaGuard)
  @ApiOperation({
    summary: 'Cadastrar novo usuário',
    description:
      'Requires `captchaToken` in the body when CAPTCHA_ENFORCE=true. No-op otherwise.',
  })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(dto);
    this.maybeSetSessionCookies(res, result);
    return result;
  }

  @Post('accept-tos')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Registrar aceitação da versão atual dos Termos de Uso' })
  acceptTos(
    @CurrentUser() user: AuthUser,
    @Body() body: { tosVersion: string },
  ) {
    return this.authService.acceptTos(user.id, body?.tosVersion);
  }

  @Post('login')
  @Throttle(LOGIN_THROTTLE)
  @UseGuards(CaptchaGuard)
  @ApiOperation({
    summary: 'Entrar na conta (retorna requiresTwoFa:true se 2FA ativo)',
    description:
      'Requires `captchaToken` in the body when CAPTCHA_ENFORCE=true. Global 60/min throttle plus 10/15min on this endpoint plus the per-email progressive lockout in the service layer close the credential-stuffing window.',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: { ip?: string },
    @Res({ passthrough: true }) res: Response,
    @Headers('x-device-id') rawDeviceId?: string,
    @Headers('x-platform') platform?: string,
  ) {
    // main.ts sets Express `trust proxy` to the configured hop count, so
    // req.ip is the real client IP. Never read X-Forwarded-For directly —
    // attackers forge it, which used to poison the login audit trail and
    // let attackers hide the origin of a new-device alert.
    const ip = req.ip ?? '';
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
    const deviceIdHash = rawDeviceId
      ? crypto.createHash('sha256').update(rawDeviceId).digest('hex')
      : undefined;
    const result = await this.authService.login(dto, ipHash, deviceIdHash, platform);
    // Only set cookies on the success branch — when login returns a 2FA
    // challenge, no real tokens have been issued yet (the tempToken is
    // never put into a session cookie). maybeSetSessionCookies is a no-op
    // for token-less responses, which preserves that.
    this.maybeSetSessionCookies(res, result);
    return result;
  }

  @Post('2fa/confirm-login')
  @Throttle(TWOFA_THROTTLE)
  @ApiOperation({ summary: 'Confirmar login com código 2FA (após requiresTwoFa:true)' })
  async confirmLoginWithTwoFa(
    @Body() dto: ConfirmLoginTwoFaDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.confirmLoginWithTwoFa(dto.tempToken, dto.token);
    this.maybeSetSessionCookies(res, result);
    return result;
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  @Throttle(TWOFA_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Iniciar configuração do 2FA — retorna QR code e chave secreta' })
  setupTwoFa(@CurrentUser() user: AuthUser) {
    return this.authService.setupTwoFa(user.id);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @Throttle(TWOFA_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ativar 2FA verificando o primeiro código TOTP' })
  enableTwoFa(@CurrentUser() user: AuthUser, @Body() dto: VerifyTwoFaDto) {
    return this.authService.enableTwoFa(user.id, dto.token);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @Throttle(TWOFA_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Desativar 2FA (requer código TOTP ou SMS atual)' })
  disableTwoFa(@CurrentUser() user: AuthUser, @Body() dto: VerifyTwoFaDto) {
    return this.authService.disableTwoFa(user.id, dto.token);
  }

  // ── SMS 2FA enrollment ────────────────────────────────────────────

  @Post('2fa/sms/setup')
  @UseGuards(JwtAuthGuard)
  @Throttle(TWOFA_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Iniciar 2FA por SMS — cadastra telefone e envia código' })
  setupSms2Fa(@CurrentUser() user: AuthUser, @Body() dto: SetupSmsDto) {
    return this.authService.setupSms2Fa(user.id, dto.phone);
  }

  @Post('2fa/sms/enable')
  @UseGuards(JwtAuthGuard)
  @Throttle(TWOFA_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ativar 2FA por SMS com o código recebido' })
  enableSms2Fa(@CurrentUser() user: AuthUser, @Body() dto: VerifyTwoFaDto) {
    return this.authService.enableSms2Fa(user.id, dto.token);
  }

  @Post('2fa/sms/resend')
  @UseGuards(JwtAuthGuard)
  @Throttle(TWOFA_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reenviar código SMS durante enrollment (usuário autenticado)' })
  resendEnrollmentSms(@CurrentUser() user: AuthUser) {
    return this.authService.resendEnrollmentSmsCode(user.id);
  }

  @Post('2fa/sms/login-resend')
  @Throttle(TWOFA_THROTTLE)
  @UseGuards(CaptchaGuard)
  @ApiOperation({
    summary: 'Reenviar código SMS durante login (requer tempToken do login)',
    description:
      'Requires `captchaToken` in the body when CAPTCHA_ENFORCE=true. SMS costs money; captcha protects against resend floods on a stolen tempToken.',
  })
  resendLoginSms(@Body() dto: ResendLoginSmsDto) {
    return this.authService.resendLoginSmsCode(dto.tempToken);
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
  async refresh(
    @Req() req: { headers: Record<string, string | undefined>; cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ) {
    // Accept refresh token from EITHER:
    //   • the vintage_refresh HttpOnly cookie (web — preferred, never
    //     readable by JavaScript), OR
    //   • the Authorization: Bearer header (mobile — keys are kept in
    //     the OS keychain, the cookie path doesn't apply).
    const cookieToken = req.cookies?.['vintage_refresh'];
    const authHeader = req.headers['authorization'] ?? '';
    const headerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : '';
    const rawToken = cookieToken || headerToken;
    if (!rawToken) {
      throw new UnauthorizedException('Token ausente');
    }
    const result = await this.authService.refreshToken(rawToken);
    this.maybeSetSessionCookies(res, result);
    return result;
  }

  @Post('logout')
  @ApiOperation({
    summary: 'Encerrar sessão (limpa cookies HttpOnly do navegador)',
    description:
      'Stateless on the server side — JWTs aren\'t blacklisted. Web clients call this to drop the session + refresh cookies; mobile clients can simply discard their tokens locally.',
  })
  logout(@Res({ passthrough: true }) res: Response) {
    clearSessionCookies(res, this.cookieConfig);
    return { success: true };
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
    this.maybeSetSessionCookies(res, result);
    res.json(result);
  }

  @Post('apple/callback')
  @ApiOperation({ summary: 'Callback do Apple Sign In' })
  async appleCallback(
    @Body() body: { identityToken: string; name?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body.identityToken) {
      throw new BadRequestException('Token de identidade Apple é obrigatório');
    }

    const profile = await this.appleStrategy.verifyIdentityToken(
      body.identityToken,
      body.name,
    );

    const result = await this.authService.socialLogin('apple', profile);
    this.maybeSetSessionCookies(res, result);
    return result;
  }

  @Post('google/token')
  @ApiOperation({ summary: 'Login com Google via ID token (mobile)' })
  async googleTokenAuth(
    @Body() body: { idToken: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body.idToken) {
      throw new BadRequestException('ID token do Google é obrigatório');
    }
    const profile = await this.authService.verifyGoogleIdToken(body.idToken);
    const result = await this.authService.socialLogin('google', profile);
    this.maybeSetSessionCookies(res, result);
    return result;
  }

  @Post('link-social')
  @UseGuards(JwtAuthGuard)
  @Throttle(PASSWORD_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Vincular login social (Google/Apple) à conta atual',
    description:
      'Required second step for users who registered with password and want to add a social login. Replaces the previous silent-merge behaviour of /auth/google/token and /auth/apple/callback, which let anyone controlling the email at Google/Apple take over an existing password account.',
  })
  async linkSocial(
    @CurrentUser() user: AuthUser,
    @Body() dto: LinkSocialDto,
  ) {
    // Verify the social identity token inside the controller so the service
    // only receives an already-vouched profile — same pattern as
    // googleTokenAuth + appleCallback above.
    const profile =
      dto.provider === 'google'
        ? await this.authService.verifyGoogleIdToken(dto.idToken)
        : await this.appleStrategy.verifyIdentityToken(dto.idToken);
    return this.authService.linkSocialProvider(
      user.id,
      dto.password,
      dto.provider,
      profile,
    );
  }

  @Post('forgot-password')
  @Throttle(PASSWORD_THROTTLE)
  @UseGuards(CaptchaGuard)
  @ApiOperation({
    summary: 'Solicitar redefinição de senha por email',
    description:
      'Requires `captchaToken` in the body when CAPTCHA_ENFORCE=true. Captcha stops scripted enumeration of valid emails across the response-time side-channel.',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Throttle(PASSWORD_THROTTLE)
  @ApiOperation({ summary: 'Redefinir senha com token recebido por email' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('request-email-verification')
  @Throttle(PASSWORD_THROTTLE)
  @UseGuards(CaptchaGuard)
  @ApiOperation({
    summary: 'Reenviar email de verificação',
    description:
      'Always returns success regardless of whether the email is registered. The actual issuance is rate-limited per-user inside AuthService (1 per minute, 5 per hour) so this endpoint cannot be used to flood a victim\'s inbox.',
  })
  requestEmailVerification(@Body() dto: RequestEmailVerificationDto) {
    return this.authService.requestEmailVerification(dto.email);
  }

  @Post('verify-email')
  @Throttle(PASSWORD_THROTTLE)
  @ApiOperation({ summary: 'Confirmar email com token recebido' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @Throttle(PASSWORD_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Alterar senha (requer senha atual)' })
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Post('request-email-change')
  @UseGuards(JwtAuthGuard)
  @Throttle(PASSWORD_THROTTLE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Solicitar alteração de email (envia link ao novo endereço)' })
  requestEmailChange(@CurrentUser() user: AuthUser, @Body() dto: RequestEmailChangeDto) {
    return this.authService.requestEmailChange(user.id, dto.newEmail, dto.password);
  }

  @Post('confirm-email-change')
  @Throttle(PASSWORD_THROTTLE)
  @ApiOperation({ summary: 'Confirmar alteração de email com token recebido' })
  confirmEmailChange(@Body() dto: ConfirmEmailChangeDto) {
    return this.authService.confirmEmailChange(dto.token);
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
