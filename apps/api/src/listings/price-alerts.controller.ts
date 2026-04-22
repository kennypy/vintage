import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('price-alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('price-alerts')
export class PriceAlertsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar alertas de queda de preço do usuário (derivados dos favoritos)',
  })
  async list(@CurrentUser() user: AuthUser) {
    const alerts = await this.prisma.priceDropAlert.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            priceBrl: true,
            status: true,
            images: { take: 1, orderBy: { position: 'asc' }, select: { url: true } },
          },
        },
      },
    });

    return {
      items: alerts.map((a) => {
        const currentPrice = Number(a.listing.priceBrl);
        const originalPrice = Number(a.originalPriceBrl);
        const dropped = currentPrice < originalPrice;
        return {
          id: a.id,
          listingId: a.listing.id,
          title: a.listing.title,
          status: a.listing.status,
          imageUrl: a.listing.images[0]?.url ?? null,
          originalPriceBrl: originalPrice,
          currentPriceBrl: currentPrice,
          dropped,
          dropPct: dropped
            ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
            : 0,
          notifiedAt: a.notifiedAt,
          createdAt: a.createdAt,
        };
      }),
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover alerta de preço' })
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const alert = await this.prisma.priceDropAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alerta não encontrado');
    if (alert.userId !== user.id) throw new ForbiddenException();

    await this.prisma.priceDropAlert.delete({ where: { id } });
    return { deleted: true };
  }
}
