import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';

@ApiTags('reports')
@Controller()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('reports')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  // P-11 follow-up: 20 reports per 24 hours per caller. Reports
  // themselves are already deduped per (reporter, targetType, targetId)
  // within 24 h by the service layer, but a griefer could rotate
  // targetIds to flood the admin queue with 1-per-listing reports.
  // 20/day is generous for a genuine power-user who spots a spate of
  // counterfeit listings in one session and tight enough that a
  // scripted flood is bounded.
  @Throttle({ default: { limit: 20, ttl: 24 * 60 * 60 * 1000 } })
  @ApiOperation({ summary: 'Registrar denúncia' })
  createReport(@Body() dto: CreateReportDto, @CurrentUser() user: AuthUser) {
    return this.reportsService.createReport(user.id, dto);
  }

  @Get('reports')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Listar denúncias do usuário autenticado' })
  getUserReports(@CurrentUser() user: AuthUser) {
    return this.reportsService.getUserReports(user.id);
  }

  // --- Admin ---

  @Get('admin/reports')
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Listar denúncias (admin)' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'RESOLVED', 'REVIEWED'] })
  @ApiQuery({ name: 'targetType', required: false })
  listReportsAdmin(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('status') status?: string,
    @Query('targetType') targetType?: string,
  ) {
    return this.reportsService.listReportsAdmin(
      page,
      Math.min(pageSize, 100),
      status,
      targetType,
    );
  }

  @Patch('admin/reports/:id')
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Resolver ou dispensar uma denúncia (admin)' })
  resolveReport(
    @Param('id') id: string,
    @Body() dto: ResolveReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reportsService.resolveReportAdmin(id, user.id, dto);
  }
}
