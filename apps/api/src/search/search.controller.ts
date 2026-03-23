import {
  Controller,
  Get,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Buscar anúncios via Meilisearch' })
  @ApiQuery({ name: 'q', required: false, description: 'Termo de busca' })
  @ApiQuery({ name: 'categoryId', required: false, description: 'Filtrar por categoria' })
  @ApiQuery({ name: 'brandId', required: false, description: 'Filtrar por marca' })
  @ApiQuery({ name: 'condition', required: false, description: 'Filtrar por condição do item' })
  @ApiQuery({ name: 'size', required: false, description: 'Filtrar por tamanho' })
  @ApiQuery({ name: 'color', required: false, description: 'Filtrar por cor' })
  @ApiQuery({ name: 'minPrice', required: false, type: Number, description: 'Preço mínimo em BRL' })
  @ApiQuery({ name: 'maxPrice', required: false, type: Number, description: 'Preço máximo em BRL' })
  @ApiQuery({ name: 'sort', required: false, enum: ['newest', 'oldest', 'price_asc', 'price_desc', 'popular'], description: 'Ordenação dos resultados' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Página atual' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Itens por página' })
  search(
    @Query('q') q?: string,
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
    @Query('condition') condition?: string,
    @Query('size') size?: string,
    @Query('color') color?: string,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('sort', new DefaultValuePipe('newest')) sort?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize?: number,
  ) {
    return this.searchService.search(
      q || '',
      {
        categoryId,
        brandId,
        condition,
        size,
        color,
        minPrice: minPrice !== undefined ? Number(minPrice) : undefined,
        maxPrice: maxPrice !== undefined ? Number(maxPrice) : undefined,
      },
      sort!,
      page!,
      pageSize!,
    );
  }
}
