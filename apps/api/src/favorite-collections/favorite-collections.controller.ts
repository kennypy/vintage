import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { FavoriteCollectionsService } from './favorite-collections.service';

class UpsertCollectionDto {
  @IsString()
  @Length(1, 64)
  name!: string;
}

class MoveFavoriteDto {
  @IsString()
  @Length(8, 128)
  listingId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  collectionId?: string | null;
}

@ApiTags('favorite-collections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('favorite-collections')
export class FavoriteCollectionsController {
  constructor(private readonly service: FavoriteCollectionsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar minhas coleções de favoritos' })
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar nova coleção' })
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertCollectionDto) {
    return this.service.create(user.id, dto.name);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Renomear coleção' })
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpsertCollectionDto,
  ) {
    return this.service.rename(user.id, id, dto.name);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover coleção (itens voltam para a padrão)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }

  @Get(':id/items')
  @ApiOperation({ summary: 'Listar itens de uma coleção' })
  getContents(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.service.getContents(user.id, id, page, pageSize);
  }

  @Post('move')
  @ApiOperation({ summary: 'Mover favorito entre coleções' })
  move(@CurrentUser() user: AuthUser, @Body() dto: MoveFavoriteDto) {
    return this.service.moveFavorite(user.id, dto.listingId, dto.collectionId ?? null);
  }
}
