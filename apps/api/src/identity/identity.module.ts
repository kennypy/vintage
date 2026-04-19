import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { SerproClient } from './serpro.client';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [IdentityController],
  providers: [IdentityService, SerproClient],
  exports: [IdentityService],
})
export class IdentityModule {}
