import {
  Controller,
  Get,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminAnalyticsService } from './admin-analytics.service';

@ApiTags('Admin Analytics')
@Controller('admin/analytics')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AdminAnalyticsService) {}

  @Get('overview')
  getOverview() {
    return this.analyticsService.getOverview();
  }

  @Get('sales')
  getSales(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.analyticsService.getSales(page, Math.min(pageSize, 100));
  }

  @Get('sales-by-category')
  getSalesByCategory() {
    return this.analyticsService.getSalesByCategory();
  }

  @Get('pricing')
  getPricingData() {
    return this.analyticsService.getPricingData();
  }
}
