import {
  Controller,
  Post,
  Get,
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
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { DisputesService } from './disputes.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';

@ApiTags('disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Post()
  @ApiOperation({ summary: 'Abrir disputa para um pedido' })
  @ApiResponse({ status: 201, description: 'Disputa aberta com sucesso' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDisputeDto) {
    return this.disputesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar disputas do usuário' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Lista de disputas' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.disputesService.findUserDisputes(user.id, page, pageSize);
  }

  @Get('admin/open')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: listar disputas em aberto para triagem' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  findAdminOpen(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.disputesService.findOpenDisputes(page, pageSize);
  }

  @Post(':id/resolve')
  @UseGuards(AdminGuard)
  // Per-admin throttle on a money-moving action. HashThrottlerGuard
  // keys on user.id once authenticated, so this is a per-ADMIN cap
  // and doesn't throttle across the admin team. 30 / hour is far
  // above legitimate triage velocity; a compromised admin session
  // scripting refunds gets stopped well before serious damage.
  @Throttle({ default: { limit: 30, ttl: 60 * 60 * 1000 } })
  @ApiOperation({ summary: 'Resolver disputa (administrador)' })
  @ApiResponse({ status: 200, description: 'Disputa resolvida' })
  resolve(
    @Param('id') id: string,
    @Body() body: ResolveDisputeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.disputesService.resolve(id, body.resolution, body.refund, user.id);
  }
}
