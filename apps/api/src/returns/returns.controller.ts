import {
  Controller,
  Get,
  Post,
  Patch,
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { ApproveReturnDto, InspectReturnDto, RejectReturnDto } from './dto/approve-return.dto';

@ApiTags('returns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar devoluções do usuário (enviadas ou recebidas)' })
  @ApiQuery({ name: 'type', enum: ['sent', 'received'], required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('type', new DefaultValuePipe('sent')) type: 'sent' | 'received',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.returns.findUserReturns(user.id, type, page, pageSize);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhar uma devolução' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.returns.findOne(id, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Solicitar devolução de um pedido entregue' })
  @ApiResponse({ status: 201, description: 'Devolução criada' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReturnDto) {
    return this.returns.create(user.id, dto);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Vendedor aprova a devolução (gera etiqueta de retorno)' })
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApproveReturnDto,
  ) {
    return this.returns.approve(id, user.id, dto);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Vendedor rejeita a devolução (escala para disputa)' })
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectReturnDto,
  ) {
    return this.returns.reject(id, user.id, dto);
  }

  @Patch(':id/mark-shipped')
  @ApiOperation({ summary: 'Comprador marca a devolução como enviada' })
  markShipped(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.returns.markShipped(id, user.id);
  }

  @Patch(':id/inspect-approve')
  @ApiOperation({ summary: 'Vendedor inspeciona e aprova reembolso' })
  inspectApprove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: InspectReturnDto,
  ) {
    return this.returns.inspectApprove(id, user.id, dto);
  }

  @Patch(':id/inspect-reject')
  @ApiOperation({ summary: 'Vendedor inspeciona e rejeita (escala para disputa)' })
  inspectReject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectReturnDto,
  ) {
    return this.returns.inspectReject(id, user.id, dto);
  }
}
