import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { IsString, IsIn, IsOptional, MaxLength } from 'class-validator';
import { AdminGuard } from '../common/guards/admin.guard';
import { ModerationService, ReviewAction } from './moderation.service';

class ReviewReportDto {
  @IsIn(['SUSPEND_LISTING', 'BAN_USER', 'DISMISS'])
  action!: ReviewAction;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class SuspendListingDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

class BanUserDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

class ResolveImageFlagDto {
  @IsIn(['DISMISS', 'REJECT'])
  action!: 'DISMISS' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class ResolveFraudFlagDto {
  @IsIn(['DISMISS', 'REVIEWED'])
  action!: 'DISMISS' | 'REVIEWED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

@ApiTags('moderation')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('reports')
  @ApiOperation({ summary: 'Listar denúncias pendentes (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'targetType', required: false, type: String, enum: ['listing', 'user'] })
  @ApiResponse({ status: 200, description: 'Lista de denúncias pendentes' })
  listReports(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('targetType') targetType?: string,
  ) {
    return this.moderationService.listPendingReports(page, pageSize, targetType);
  }

  @Patch('reports/:id')
  @ApiOperation({ summary: 'Revisar denúncia — suspender anúncio, banir usuário ou dispensar (admin)' })
  @ApiResponse({ status: 200, description: 'Denúncia revisada' })
  reviewReport(
    @Param('id') id: string,
    @Body() body: ReviewReportDto,
  ) {
    // adminId not needed in response but passed for audit in service
    return this.moderationService.reviewReport(id, body.action, 'admin', body.note);
  }

  @Post('listings/:id/suspend')
  @ApiOperation({ summary: 'Suspender anúncio diretamente (admin)' })
  @ApiResponse({ status: 201, description: 'Anúncio suspenso' })
  suspendListing(
    @Param('id') id: string,
    @Body() body: SuspendListingDto,
  ) {
    return this.moderationService.suspendListing(id, 'admin', body.reason);
  }

  @Delete('listings/:id/suspend')
  @ApiOperation({ summary: 'Remover suspensão de anúncio (admin)' })
  @ApiResponse({ status: 200, description: 'Suspensão removida' })
  unsuspendListing(@Param('id') id: string) {
    return this.moderationService.unsuspendListing(id);
  }

  @Post('users/:id/ban')
  @ApiOperation({ summary: 'Banir usuário (admin)' })
  @ApiResponse({ status: 201, description: 'Usuário banido' })
  banUser(
    @Param('id') id: string,
    @Body() body: BanUserDto,
  ) {
    return this.moderationService.banUser(id, 'admin', body.reason);
  }

  @Delete('users/:id/ban')
  @ApiOperation({ summary: 'Remover banimento de usuário (admin)' })
  @ApiResponse({ status: 200, description: 'Banimento removido' })
  unbanUser(@Param('id') id: string) {
    return this.moderationService.unbanUser(id);
  }

  @Get('image-flags')
  @ApiOperation({ summary: 'Listar imagens sinalizadas pelo SafeSearch (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Fila de imagens aguardando revisão' })
  listImageFlags(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.moderationService.listPendingImageFlags(page, pageSize);
  }

  @Patch('image-flags/:id')
  @ApiOperation({
    summary: 'Resolver sinalização de imagem (admin)',
    description:
      'DISMISS: marca a sinalização como falso-positivo. REJECT: remove a imagem de qualquer anúncio que a utilize e suspende o anúncio.',
  })
  @ApiResponse({ status: 200, description: 'Sinalização resolvida' })
  resolveImageFlag(
    @Param('id') id: string,
    @Body() body: ResolveImageFlagDto,
  ) {
    return this.moderationService.resolveImageFlag(id, body.action, 'admin', body.note);
  }

  @Get('fraud-flags')
  @ApiOperation({ summary: 'Listar sinalizações de fraude pendentes (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Fila FIFO de fraude pendente' })
  listFraudFlags(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.moderationService.listPendingFraudFlags(page, pageSize);
  }

  @Patch('fraud-flags/:id')
  @ApiOperation({
    summary: 'Resolver sinalização de fraude (admin)',
    description:
      'DISMISS: falso-positivo, nenhuma ação. REVIEWED: investigação concluída (pode ter levado a ban/unban separado).',
  })
  @ApiResponse({ status: 200, description: 'Sinalização resolvida' })
  resolveFraudFlag(
    @Param('id') id: string,
    @Body() body: ResolveFraudFlagDto,
  ) {
    return this.moderationService.resolveFraudFlag(id, body.action, 'admin', body.note);
  }

  @Post('users/:id/force-logout')
  @ApiOperation({
    summary: 'Forçar logout global do usuário (admin)',
    description:
      'Incrementa tokenVersion e invalida toda sessão atual sem banir a conta. ' +
      'Para suspender a conta inteira, use POST /users/:id/ban.',
  })
  @ApiResponse({ status: 201, description: 'Todas as sessões invalidadas' })
  forceLogout(@Param('id') id: string) {
    return this.moderationService.forceLogout(id);
  }
}
