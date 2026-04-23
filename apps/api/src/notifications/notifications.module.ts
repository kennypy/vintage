import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PushModule } from '../push/push.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { FcmService } from './fcm.service';

@Module({
  imports: [PrismaModule, PushModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, FcmService],
  exports: [NotificationsService, FcmService],
})
export class NotificationsModule {}
