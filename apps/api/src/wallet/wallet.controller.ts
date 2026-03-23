import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

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

  @Post('payout')
  @ApiOperation({ summary: 'Solicitar saque via PIX' })
  requestPayout(
    @Body() body: { amountBrl: number },
    @CurrentUser() user: AuthUser,
  ) {
    return this.walletService.requestPayout(user.id, body.amountBrl);
  }
}
