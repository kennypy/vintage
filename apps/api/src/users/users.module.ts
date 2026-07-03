import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { ListingsModule } from '../listings/listings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { DataExportService } from './data-export.service';
import { ViaCepService } from './viacep.service';

@Module({
  imports: [PrismaModule, EmailModule, ListingsModule, NotificationsModule],
  controllers: [UsersController],
  providers: [UsersService, DataExportService, ViaCepService],
  exports: [UsersService],
})
export class UsersModule {}
