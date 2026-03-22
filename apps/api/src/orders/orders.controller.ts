import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Create order from listing' })
  create(@Body() _body: any) {
    return { message: 'TODO' };
  }

  @Get()
  @ApiOperation({ summary: "List user's orders as buyer/seller" })
  findAll(@Query() _query: any) {
    return { message: 'TODO' };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order detail' })
  findOne(@Param('id') _id: string) {
    return { message: 'TODO' };
  }

  @Patch(':id/ship')
  @ApiOperation({ summary: 'Mark order as shipped' })
  ship(@Param('id') _id: string, @Body() _body: any) {
    return { message: 'TODO' };
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: 'Buyer confirms receipt' })
  confirm(@Param('id') _id: string) {
    return { message: 'TODO' };
  }
}
