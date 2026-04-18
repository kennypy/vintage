import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { PayoutMethodsService } from './payout-methods.service';
import { PayoutsService } from './payouts.service';

@Module({
  imports: [PrismaModule, PaymentsModule],
  controllers: [WalletController],
  providers: [WalletService, PayoutMethodsService, PayoutsService],
  exports: [WalletService, PayoutMethodsService, PayoutsService],
})
export class WalletModule {}
