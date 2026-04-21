import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IdentityController } from './identity.controller';
import { CafWebhookController } from './caf-webhook.controller';
import { IdentityService } from './identity.service';
import { IdentityReminderCron } from './identity-reminder.cron';
import { SerproClient } from './serpro.client';
import { CafClient } from './caf.client';

@Module({
  imports: [ConfigModule, PrismaModule, NotificationsModule],
  controllers: [IdentityController, CafWebhookController],
  providers: [IdentityService, IdentityReminderCron, SerproClient, CafClient],
  exports: [IdentityService],
})
export class IdentityModule {}
