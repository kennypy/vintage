import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { IdentityController } from './identity.controller';
import { CafWebhookController } from './caf-webhook.controller';
import { IdentityService } from './identity.service';
import { SerproClient } from './serpro.client';
import { CafClient } from './caf.client';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [IdentityController, CafWebhookController],
  providers: [IdentityService, SerproClient, CafClient],
  exports: [IdentityService],
})
export class IdentityModule {}
