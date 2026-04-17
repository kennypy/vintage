import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { PayoutMethodsService } from './payout-methods.service';

@Module({
  imports: [PrismaModule],
  controllers: [WalletController],
  providers: [WalletService, PayoutMethodsService],
  exports: [WalletService, PayoutMethodsService],
})
export class WalletModule {}
