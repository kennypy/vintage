import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { ListingsModule } from '../listings/listings.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { DataExportService } from './data-export.service';

@Module({
  imports: [PrismaModule, EmailModule, ListingsModule],
  controllers: [UsersController],
  providers: [UsersService, DataExportService],
  exports: [UsersService],
})
export class UsersModule {}
