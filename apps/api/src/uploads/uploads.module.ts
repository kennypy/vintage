import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { ImageAnalysisService } from './image-analysis.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [UploadsController],
  providers: [UploadsService, ImageAnalysisService],
  exports: [UploadsService],
})
export class UploadsModule {}
