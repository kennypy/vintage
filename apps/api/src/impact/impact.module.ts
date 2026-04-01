import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ImpactService } from './impact.service';
import { ImpactController } from './impact.controller';

@Module({
  imports: [PrismaModule],
  providers: [ImpactService],
  controllers: [ImpactController],
  exports: [ImpactService],
})
export class ImpactModule {}
