import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { ListingsCronService } from './listings-cron.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [ListingsController],
  providers: [ListingsService, ListingsCronService],
  exports: [ListingsService],
})
export class ListingsModule {}
