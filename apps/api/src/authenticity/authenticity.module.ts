import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthenticityService } from './authenticity.service';
import { AuthenticityController } from './authenticity.controller';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [AuthenticityService],
  controllers: [AuthenticityController],
  exports: [AuthenticityService],
})
export class AuthenticityModule {}
