import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SearchModule } from '../search/search.module';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { ListingsCronService } from './listings-cron.service';

@Module({
  imports: [ConfigModule, PrismaModule, NotificationsModule, SearchModule],
  controllers: [ListingsController],
  providers: [ListingsService, ListingsCronService],
  exports: [ListingsService],
})
export class ListingsModule {}
