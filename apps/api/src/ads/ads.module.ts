import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AudienceModule } from '../audience/audience.module';
import { AdsController } from './ads.controller';
import { AdsService } from './ads.service';
import { BotDetectionService } from './bot-detection.service';

@Module({
  imports: [PrismaModule, AudienceModule],
  controllers: [AdsController],
  providers: [AdsService, BotDetectionService],
  exports: [AdsService],
})
export class AdsModule {}
