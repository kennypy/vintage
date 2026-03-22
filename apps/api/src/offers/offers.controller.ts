import { Controller, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OffersService } from './offers.service';

@ApiTags('offers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Post()
  @ApiOperation({ summary: 'Make offer on listing' })
  create(@Body() _body: any) {
    return { message: 'TODO' };
  }

  @Patch(':id/accept')
  @ApiOperation({ summary: 'Accept offer' })
  accept(@Param('id') _id: string) {
    return { message: 'TODO' };
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject offer' })
  reject(@Param('id') _id: string) {
    return { message: 'TODO' };
  }
}
