import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto } from './dto/create-address.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('storefront/:username')
  @ApiOperation({ summary: 'Ver vitrine pública de um vendedor' })
  getStorefront(
    @Param('username') username: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
  ) {
    return this.usersService.getStorefront(username, page, pageSize);
  }

  @Patch('me/cover-photo')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Atualizar foto de capa do perfil' })
  updateCoverPhoto(
    @Body() body: { coverPhotoUrl: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.updateCoverPhoto(user.id, body.coverPhotoUrl);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar perfil de usuário' })
  getProfile(@Param('id') id: string) {
    return this.usersService.getProfile(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Atualizar perfil (avatar, bio, telefone)' })
  updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.updateProfile(id, user.id, dto);
  }

  @Get(':id/listings')
  @ApiOperation({ summary: 'Listar anúncios do usuário' })
  getUserListings(
    @Param('id') id: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
  ) {
    return this.usersService.getUserListings(id, page, pageSize);
  }

  // --- Addresses ---

  @Get('me/addresses')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Listar endereços do usuário autenticado' })
  getAddresses(@CurrentUser() user: AuthUser) {
    return this.usersService.getAddresses(user.id);
  }

  @Post('me/addresses')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Adicionar endereço' })
  createAddress(@Body() dto: CreateAddressDto, @CurrentUser() user: AuthUser) {
    return this.usersService.createAddress(user.id, dto);
  }

  @Delete('me/addresses/:addressId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remover endereço' })
  deleteAddress(@Param('addressId') addressId: string, @CurrentUser() user: AuthUser) {
    return this.usersService.deleteAddress(user.id, addressId);
  }

  // --- Follow ---

  @Post(':id/follow')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Seguir usuário' })
  follow(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.followUser(user.id, id);
  }

  @Delete(':id/follow')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Deixar de seguir' })
  unfollow(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.unfollowUser(user.id, id);
  }

  // --- Vacation Mode ---

  @Patch('me/vacation')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Ativar/desativar modo férias' })
  toggleVacation(
    @Body() body: { enabled: boolean; untilDate?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.toggleVacationMode(user.id, body.enabled, body.untilDate);
  }
}
