import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get wallet balance' })
  getBalance() {
    return { message: 'TODO' };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get transaction history' })
  getTransactions() {
    return { message: 'TODO' };
  }

  @Post('payout')
  @ApiOperation({ summary: 'Request payout' })
  requestPayout(@Body() _body: any) {
    return { message: 'TODO' };
  }
}
