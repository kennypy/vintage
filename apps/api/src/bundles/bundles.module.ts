import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BundlesController } from './bundles.controller';
import { BundlesService } from './bundles.service';

@Module({
  imports: [PrismaModule],
  controllers: [BundlesController],
  providers: [BundlesService],
  exports: [BundlesService],
})
export class BundlesModule {}
