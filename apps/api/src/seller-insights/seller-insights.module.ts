import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SellerInsightsService } from './seller-insights.service';
import { SellerInsightsController } from './seller-insights.controller';

@Module({
  imports: [PrismaModule],
  providers: [SellerInsightsService],
  controllers: [SellerInsightsController],
})
export class SellerInsightsModule {}
