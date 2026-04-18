import { Module } from '@nestjs/common';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { ListingsModule } from '../listings/listings.module';

@Module({
  imports: [PrismaModule, NotificationsModule, AuthModule, ListingsModule],
  controllers: [ModerationController],
  providers: [ModerationService],
})
export class ModerationModule {}
