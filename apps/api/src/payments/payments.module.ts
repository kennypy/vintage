import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FraudModule } from '../fraud/fraud.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MercadoPagoClient } from './mercadopago.client';

@Module({
  imports: [ConfigModule, PrismaModule, NotificationsModule, FraudModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, MercadoPagoClient],
  exports: [PaymentsService, MercadoPagoClient],
})
export class PaymentsModule {}
