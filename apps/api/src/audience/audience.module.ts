import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AudienceController } from './audience.controller';
import { AudienceService } from './audience.service';

@Module({
  imports: [PrismaModule],
  controllers: [AudienceController],
  providers: [AudienceService],
  exports: [AudienceService],
})
export class AudienceModule {}
