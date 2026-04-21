import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CouponsModule } from '../coupons/coupons.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ListingsModule } from '../listings/listings.module';
import { ShippingModule } from '../shipping/shipping.module';
import { FraudModule } from '../fraud/fraud.module';
import { ReturnsModule } from '../returns/returns.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { SmsModule } from '../sms/sms.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersCronService } from './orders-cron.service';
import { TrackingPollerService } from './tracking-poller.service';

@Module({
  imports: [
    PrismaModule,
    CouponsModule,
    NotificationsModule,
    ListingsModule,
    ShippingModule,
    FraudModule,
    ReturnsModule,
    ReferralsModule,
    SmsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersCronService, TrackingPollerService],
  exports: [OrdersService],
})
export class OrdersModule {}
