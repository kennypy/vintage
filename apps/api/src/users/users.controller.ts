import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
  DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { SetCpfDto } from './dto/set-cpf.dto';
import { Throttle } from '@nestjs/throttler';

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // --- Admin Endpoints ---

  @Get('admin/users')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar todos os usuários (admin)' })
  listUsersAdmin(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('search') search?: string,
  ) {
    return this.usersService.listUsersAdmin(page, Math.min(pageSize, 100), search);
  }

  @Post('admin/users/:id/promote')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Promover usuário a ADMIN' })
  promoteToAdmin(@Param('id') id: string) {
    return this.usersService.promoteToAdmin(id);
  }

  // --- Account Deletion ---

  @Post('users/me/delete-confirmation')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Solicitar código de confirmação para excluir conta OAuth',
  })
  requestDeletionConfirmation(@CurrentUser() user: AuthUser) {
    return this.usersService.requestDeletionConfirmation(user.id);
  }

  @Delete('users/me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Excluir conta — requer senha ou código de confirmação',
  })
  deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteAccountDto,
  ) {
    return this.usersService.deleteAccount(user.id, dto);
  }

  // --- User Blocks ---

  @Post('users/:id/block')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Bloquear outro usuário' })
  blockUser(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.blockUser(user.id, id);
  }

  @Delete('users/:id/block')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Desbloquear usuário' })
  unblockUser(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.unblockUser(user.id, id);
  }

  @Get('users/me/blocks')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Listar usuários bloqueados pelo usuário atual' })
  listBlocks(@CurrentUser() user: AuthUser) {
    return this.usersService.listBlocks(user.id);
  }

  // --- Public & Authenticated Endpoints ---

  @Get('users/storefront/:username')
  @ApiOperation({ summary: 'Ver vitrine pública de um vendedor' })
  getStorefront(
    @Param('username') username: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
  ) {
    return this.usersService.getStorefront(username, page, pageSize);
  }

  @Patch('users/me/cover-photo')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Atualizar foto de capa do perfil' })
  updateCoverPhoto(
    @Body() body: { coverPhotoUrl: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.updateCoverPhoto(user.id, body.coverPhotoUrl);
  }

  @Get('users/me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Perfil do usuário autenticado' })
  getMyProfile(@CurrentUser() user: AuthUser) {
    return this.usersService.getMyProfile(user.id);
  }

  @Post('users/me/cpf')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  // Tight throttle: CPF-set is a one-shot for OAuth accounts. Three attempts
  // per 15 minutes is enough for typos; more than that is brute-forcing.
  @Throttle({ default: { limit: 3, ttl: 15 * 60 * 1000 } })
  @ApiOperation({
    summary: 'Adicionar CPF à conta (contas OAuth criadas sem CPF)',
    description:
      'CPF é set-once: depois de cadastrado, alterações só via suporte para preservar a integridade de repasses e NF-e.',
  })
  setCpf(@CurrentUser() user: AuthUser, @Body() dto: SetCpfDto) {
    return this.usersService.setCpf(user.id, dto.cpf);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Buscar perfil de usuário' })
  getProfile(@Param('id') id: string) {
    return this.usersService.getProfile(id);
  }

  @Patch('users/:id')
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

  @Get('users/:id/listings')
  @ApiOperation({ summary: 'Listar anúncios do usuário' })
  getUserListings(
    @Param('id') id: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
  ) {
    return this.usersService.getUserListings(id, page, pageSize);
  }

  // --- Addresses ---

  @Get('users/me/addresses')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Listar endereços do usuário autenticado' })
  getAddresses(@CurrentUser() user: AuthUser) {
    return this.usersService.getAddresses(user.id);
  }

  @Post('users/me/addresses')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Adicionar endereço' })
  createAddress(@Body() dto: CreateAddressDto, @CurrentUser() user: AuthUser) {
    return this.usersService.createAddress(user.id, dto);
  }

  @Delete('users/me/addresses/:addressId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remover endereço' })
  deleteAddress(@Param('addressId') addressId: string, @CurrentUser() user: AuthUser) {
    return this.usersService.deleteAddress(user.id, addressId);
  }

  // --- Follow ---

  @Post('users/:id/follow')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Seguir usuário' })
  follow(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.followUser(user.id, id);
  }

  @Delete('users/:id/follow')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Deixar de seguir' })
  unfollow(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.unfollowUser(user.id, id);
  }

  // --- Vacation Mode ---

  @Patch('users/me/vacation')
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
