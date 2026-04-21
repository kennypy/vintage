import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersModule } from '../orders/orders.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminOrdersController } from './admin-orders.controller';

@Module({
  imports: [PrismaModule, OrdersModule, AuditLogModule],
  controllers: [AdminAnalyticsController, AdminOrdersController],
  providers: [AdminAnalyticsService],
})
export class AdminAnalyticsModule {}
