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
