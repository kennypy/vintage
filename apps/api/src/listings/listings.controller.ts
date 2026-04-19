import {
  Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ListingsService } from './listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { SearchListingsDto } from './dto/search-listings.dto';

class SetListingVideoDto {
  @IsString()
  videoUrl!: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  durationSeconds?: number;
}

@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  // Per-user listing-creation cap. Beyond a normal flea-market cadence
  // (30 / hour is a heavy power-seller), this is used to slow down
  // scraped-catalog dumps and spam-listing attacks. HashThrottlerGuard
  // keys on user.id so a seller on a busy office network isn't
  // collateral-limited by a coworker.
  @Throttle({ default: { limit: 30, ttl: 60 * 60 * 1000 } })
  @ApiOperation({ summary: 'Criar anúncio' })
  create(@Body() dto: CreateListingDto, @CurrentUser() user: AuthUser) {
    return this.listingsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Buscar anúncios com filtros' })
  search(@Query() dto: SearchListingsDto) {
    return this.listingsService.search(dto);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Listar categorias' })
  getCategories() {
    return this.listingsService.getCategories();
  }

  @Get('brands')
  @ApiOperation({ summary: 'Buscar marcas' })
  searchBrands(@Query('q') q: string) {
    return this.listingsService.searchBrands(q || '');
  }

  @Post('saved-searches')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Salvar busca para receber notificações' })
  saveSearch(
    @Body() body: { query: string; filters?: Record<string, any> },
    @CurrentUser() user: AuthUser,
  ) {
    return this.listingsService.saveSearch(user.id, body.query, body.filters ?? {});
  }

  @Get('saved-searches')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Listar buscas salvas do usuário' })
  getSavedSearches(@CurrentUser() user: AuthUser) {
    return this.listingsService.getSavedSearches(user.id);
  }

  @Delete('saved-searches/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remover busca salva' })
  deleteSavedSearch(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.listingsService.deleteSavedSearch(id, user.id);
  }

  @Get('price-suggestion')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Obter sugestão de preço inteligente baseada em vendas anteriores' })
  getPriceSuggestion(
    @Query('categoryId') categoryId: string,
    @Query('brandId') brandId?: string,
    @Query('condition') condition?: string,
    @Query('size') size?: string,
  ) {
    return this.listingsService.getPriceSuggestion(categoryId, brandId, condition, size);
  }

  @Get('feed')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Feed de anúncios de quem você segue' })
  getFollowingFeed(
    @CurrentUser() user: AuthUser,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
  ) {
    return this.listingsService.getFollowingFeed(user.id, page, pageSize);
  }

  @Get('favorites')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Listar favoritos' })
  getFavorites(
    @CurrentUser() user: AuthUser,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
  ) {
    return this.listingsService.getUserFavorites(user.id, page, pageSize);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ver detalhes do anúncio' })
  findOne(@Param('id') id: string) {
    return this.listingsService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Editar anúncio' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.listingsService.update(id, user.id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remover anúncio' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.listingsService.remove(id, user.id);
  }

  @Post(':id/favorite')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Favoritar/desfavoritar anúncio' })
  toggleFavorite(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.listingsService.toggleFavorite(id, user.id);
  }

  @Put(':id/video')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Associar vídeo a um anúncio (URL obtida de /uploads/listing-video)' })
  setListingVideo(
    @Param('id') id: string,
    @Body() dto: SetListingVideoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.listingsService.setListingVideo(id, user.id, dto.videoUrl, dto.thumbnailUrl, dto.durationSeconds);
  }

  @Delete(':id/video')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remover vídeo de um anúncio' })
  removeListingVideo(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.listingsService.removeListingVideo(id, user.id);
  }
}
