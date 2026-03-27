import { Controller, Post, Get, Body, UseGuards, Request, Req, Res, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
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
  @ApiOperation({ summary: 'Entrar na conta' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Renovar token de acesso' })
  refresh(@Request() req: { user: { id: string } }) {
    return this.authService.refreshToken(req.user.id);
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
}
