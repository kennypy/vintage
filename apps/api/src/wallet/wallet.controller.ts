import { Controller, Delete, Get, Param, Patch, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { WalletService } from './wallet.service';
import { PayoutMethodsService } from './payout-methods.service';
import { PayoutsService } from './payouts.service';
import { CreatePayoutMethodDto, RequestPayoutDto, AdminUpdatePayoutStatusDto } from './dto/payout-method.dto';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly payoutMethods: PayoutMethodsService,
    private readonly payouts: PayoutsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Ver saldo da carteira' })
  getBalance(@CurrentUser() user: AuthUser) {
    return this.walletService.getWallet(user.id);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Histórico de transações' })
  getTransactions(
    @CurrentUser() user: AuthUser,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
  ) {
    return this.walletService.getTransactions(user.id, page, pageSize);
  }

  // ── Saved PIX payout methods ────────────────────────────────────────

  @Get('payout-methods')
  @ApiOperation({ summary: 'Listar chaves PIX salvas (nunca retorna a chave bruta)' })
  listPayoutMethods(@CurrentUser() user: AuthUser) {
    return this.payoutMethods.list(user.id);
  }

  @Post('payout-methods')
  @ApiOperation({ summary: 'Cadastrar nova chave PIX' })
  createPayoutMethod(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePayoutMethodDto,
  ) {
    return this.payoutMethods.create(user.id, dto);
  }

  @Patch('payout-methods/:id/default')
  @ApiOperation({ summary: 'Definir chave PIX como padrão' })
  setDefaultPayoutMethod(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.payoutMethods.setDefault(user.id, id);
  }

  @Delete('payout-methods/:id')
  @ApiOperation({ summary: 'Remover chave PIX salva' })
  deletePayoutMethod(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.payoutMethods.delete(user.id, id);
  }

  @Post('payout')
  @ApiOperation({ summary: 'Solicitar saque via PIX (exige chave PIX salva e CPF verificado)' })
  requestPayout(
    @Body() dto: RequestPayoutDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payouts.requestPayout(user.id, dto.amountBrl, dto.payoutMethodId);
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Histórico de saques do usuário' })
  listMyPayouts(
    @CurrentUser() user: AuthUser,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
  ) {
    return this.payouts.listMine(user.id, page, pageSize);
  }

  // ── Admin: manually reconcile payouts while MP contract isn't active ──

  @Get('admin/payouts')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Admin: listar saques que precisam de reconciliação',
    description:
      'Default filter = PENDING | PROCESSING (ainda acionáveis). ' +
      'Use ?status=FAILED ou ?status=COMPLETED para audit de histórico.',
  })
  adminListPayouts(
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
    @Query('status') status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
  ) {
    return this.payouts.adminList(page, pageSize, status);
  }

  @Patch('admin/payouts/:id/status')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Admin: marcar saque como COMPLETED ou FAILED após processamento manual',
    description:
      'Usado enquanto o contrato Marketplace do Mercado Pago não está ativo — ' +
      'finanças processa o PIX fora da plataforma e marca aqui o resultado. ' +
      'FAILED estorna o valor para a carteira no mesmo $transaction.',
  })
  adminUpdatePayoutStatus(
    @Param('id') id: string,
    @Body() dto: AdminUpdatePayoutStatusDto,
  ) {
    return this.payouts.adminUpdateStatus(id, dto.status, dto.failureReason);
  }
}
