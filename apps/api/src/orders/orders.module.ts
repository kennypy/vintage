import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CouponsModule } from '../coupons/coupons.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ListingsModule } from '../listings/listings.module';
import { ShippingModule } from '../shipping/shipping.module';
import { FraudModule } from '../fraud/fraud.module';
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
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersCronService, TrackingPollerService],
  exports: [OrdersService],
})
export class OrdersModule {}
