import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { IdentityService } from './identity.service';

class VerifyIdentityDto {
  /** ISO 8601 date, YYYY-MM-DD. Passed to Serpro Datavalid as the
   *  DOB half of the CPF+name+DOB match. */
  @IsISO8601({ strict: true })
  birthDate!: string;
}

@ApiTags('users')
@Controller('users/me')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Post('verify-identity')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  // 5 attempts per hour per user — Serpro pricing is per-call and we
  // don't want a muscle-memory double-click (or a bad UX on the
  // client) to burn the monthly budget.
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @HttpCode(200)
  @ApiOperation({
    summary: 'Verificar identidade — valida CPF + nome + data de nascimento na Receita Federal (Serpro)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Resultado da verificação. status=VERIFIED flipa cpfIdentityVerified=true na sua conta e libera saques.',
  })
  async verifyIdentity(
    @CurrentUser() user: AuthUser,
    @Body() dto: VerifyIdentityDto,
  ) {
    return this.identity.verifyCpf(user.id, dto.birthDate);
  }

  // Track C — document + liveness via Caf. Escalation path when
  // Serpro returns NAME_MISMATCH / CPF_SUSPENDED, or when a user
  // disputes the outcome of the Tier-2 check.
  @Post('verify-identity-document')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  // Tighter rate limit than the Serpro call (1/hour per user) —
  // each Caf session costs ~R$5-10, and a user only ever needs one
  // at a time.
  @Throttle({ default: { limit: 1, ttl: 60 * 60 * 1000 } })
  @HttpCode(200)
  @ApiOperation({
    summary: 'Iniciar verificação por documento + liveness (Caf)',
    description:
      'Retorna um redirectUrl que o cliente (WebView no mobile, nova aba no web) deve abrir para capturar selfie + RG/CNH. Caf envia o resultado via webhook; na aprovação, cpfIdentityVerified é marcado como true.',
  })
  async verifyIdentityDocument(@CurrentUser() user: AuthUser) {
    return this.identity.createDocumentSession(user.id);
  }
}
