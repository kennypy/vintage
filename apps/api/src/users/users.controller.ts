import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get user profile' })
  getProfile(@Param('id') _id: string) {
    return { message: 'TODO' };
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update user profile (avatar, bio, phone)' })
  updateProfile(@Param('id') _id: string, @Body() _body: any) {
    return { message: 'TODO' };
  }

  @Get(':id/listings')
  @ApiOperation({ summary: "Get user's listings" })
  getUserListings(@Param('id') _id: string) {
    return { message: 'TODO' };
  }
}
