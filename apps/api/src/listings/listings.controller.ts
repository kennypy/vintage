import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ListingsService } from './listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { SearchListingsDto } from './dto/search-listings.dto';

@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
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
}
