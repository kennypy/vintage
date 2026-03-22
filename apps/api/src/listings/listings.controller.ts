import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ListingsService } from './listings.service';

@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new listing' })
  create(@Body() _body: any) {
    return { message: 'TODO' };
  }

  @Get()
  @ApiOperation({ summary: 'Search/browse listings with filters' })
  findAll(@Query() _query: any) {
    return { message: 'TODO' };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get listing detail' })
  findOne(@Param('id') _id: string) {
    return { message: 'TODO' };
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update listing' })
  update(@Param('id') _id: string, @Body() _body: any) {
    return { message: 'TODO' };
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Soft delete listing' })
  remove(@Param('id') _id: string) {
    return { message: 'TODO' };
  }
}
