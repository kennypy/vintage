import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  UseGuards,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

class CreateSavedSearchDto {
  @IsString()
  @Length(1, 200)
  query!: string;

  @IsOptional()
  filters?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}

class UpdateSavedSearchDto {
  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}

@ApiTags('saved-searches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('saved-searches')
export class SavedSearchesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Listar buscas salvas do usuário' })
  async list(@CurrentUser() user: AuthUser) {
    const items = await this.prisma.savedSearch.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    return { items };
  }

  @Post()
  @ApiOperation({ summary: 'Salvar uma nova busca' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateSavedSearchDto) {
    const query = dto.query.trim();
    if (!query) throw new BadRequestException('Busca vazia');

    // De-dup: if the same user already saved the same query+filters,
    // return the existing row instead of piling up duplicates.
    const existing = await this.prisma.savedSearch.findFirst({
      where: { userId: user.id, query },
    });
    if (existing) return existing;

    return this.prisma.savedSearch.create({
      data: {
        userId: user.id,
        query,
        filtersJson: (dto.filters as object) ?? {},
        notify: dto.notify ?? true,
      },
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar uma busca salva (toggle notify)' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSavedSearchDto,
  ) {
    const search = await this.prisma.savedSearch.findUnique({ where: { id } });
    if (!search) throw new NotFoundException('Busca salva não encontrada');
    if (search.userId !== user.id) throw new ForbiddenException();

    return this.prisma.savedSearch.update({
      where: { id },
      data: { notify: dto.notify ?? search.notify },
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover busca salva' })
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const search = await this.prisma.savedSearch.findUnique({ where: { id } });
    if (!search) throw new NotFoundException('Busca salva não encontrada');
    if (search.userId !== user.id) throw new ForbiddenException();

    await this.prisma.savedSearch.delete({ where: { id } });
    return { deleted: true };
  }
}
