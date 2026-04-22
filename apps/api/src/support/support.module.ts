import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminSupportController, SupportController } from './support.controller';
import { SupportPartnerController } from './support-partner.controller';
import { SupportService } from './support.service';
import { SupportCronService } from './support-cron.service';
import { CrmPartnerAuthGuard } from './crm-partner-auth.guard';

@Module({
  imports: [ConfigModule, PrismaModule, NotificationsModule],
  controllers: [SupportController, AdminSupportController, SupportPartnerController],
  providers: [SupportService, SupportCronService, CrmPartnerAuthGuard],
  exports: [SupportService],
})
export class SupportModule {}
