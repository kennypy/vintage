import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CouponsModule } from '../coupons/coupons.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersCronService } from './orders-cron.service';

@Module({
  imports: [PrismaModule, CouponsModule, NotificationsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersCronService],
  exports: [OrdersService],
})
export class OrdersModule {}
