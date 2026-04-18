import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListingsService } from '../listings/listings.service';
import { CreateBundleDto } from './dto/create-bundle.dto';
import {
  BUYER_PROTECTION_FIXED_BRL,
  BUYER_PROTECTION_RATE,
} from '@vintage/shared';

@Injectable()
export class BundlesService {
  constructor(
    private prisma: PrismaService,
    private listings: ListingsService,
  ) {}

  async create(buyerId: string, dto: CreateBundleDto) {
    // Validate all listings exist and are ACTIVE
    const listings = await this.prisma.listing.findMany({
      where: { id: { in: dto.listingIds } },
    });

    if (listings.length !== dto.listingIds.length) {
      throw new BadRequestException('Um ou mais anúncios não foram encontrados');
    }

    const nonActive = listings.filter((l) => l.status !== 'ACTIVE');
    if (nonActive.length > 0) {
      throw new BadRequestException('Todos os anúncios devem estar ativos');
    }

    // Validate all listings belong to the same seller
    const sellerIds = new Set(listings.map((l) => l.sellerId));
    if (sellerIds.size > 1) {
      throw new BadRequestException('Todos os anúncios devem ser do mesmo vendedor');
    }

    const sellerId = listings[0].sellerId;
    if (sellerId !== dto.sellerId) {
      throw new BadRequestException('O vendedor informado não corresponde aos anúncios');
    }

    if (sellerId === buyerId) {
      throw new BadRequestException('Você não pode criar um pacote com seus próprios anúncios');
    }

    return this.prisma.bundle.create({
      data: {
        buyerId,
        sellerId,
        items: {
          create: dto.listingIds.map((listingId) => ({ listingId })),
        },
      },
      include: {
        items: {
          include: {
            listing: {
              include: {
                images: { orderBy: { position: 'asc' }, take: 1 },
              },
            },
          },
        },
      },
    });
  }

  async getBundle(bundleId: string, userId: string) {
    const bundle = await this.prisma.bundle.findUnique({
      where: { id: bundleId },
      include: {
        items: {
          include: {
            listing: {
              include: {
                images: { orderBy: { position: 'asc' } },
                category: { select: { namePt: true, slug: true } },
                brand: { select: { name: true } },
                seller: { select: { id: true, name: true, avatarUrl: true } },
              },
            },
          },
        },
      },
    });

    if (!bundle) {
      throw new NotFoundException('Pacote não encontrado');
    }

    if (bundle.buyerId !== userId && bundle.sellerId !== userId) {
      throw new ForbiddenException('Você não tem acesso a este pacote');
    }

    return bundle;
  }

  async getUserBundles(userId: string) {
    return this.prisma.bundle.findMany({
      where: { buyerId: userId },
      include: {
        items: {
          include: {
            listing: {
              include: {
                images: { orderBy: { position: 'asc' }, take: 1 },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async removeItem(bundleId: string, listingId: string, userId: string) {
    const bundle = await this.prisma.bundle.findUnique({
      where: { id: bundleId },
      include: { items: true },
    });

    if (!bundle) {
      throw new NotFoundException('Pacote não encontrado');
    }

    if (bundle.buyerId !== userId) {
      throw new ForbiddenException('Apenas o comprador pode remover itens do pacote');
    }

    if (bundle.status !== 'OPEN') {
      throw new BadRequestException('Não é possível editar um pacote que já foi finalizado');
    }

    const item = bundle.items.find((i) => i.listingId === listingId);
    if (!item) {
      throw new NotFoundException('Anúncio não encontrado neste pacote');
    }

    if (bundle.items.length <= 2) {
      throw new BadRequestException('Um pacote deve ter pelo menos 2 anúncios');
    }

    await this.prisma.bundleItem.delete({
      where: { bundleId_listingId: { bundleId, listingId } },
    });

    return this.getBundle(bundleId, userId);
  }

  async checkoutBundle(
    bundleId: string,
    buyerId: string,
    addressId: string,
    paymentMethod: string,
  ) {
    const bundle = await this.prisma.bundle.findUnique({
      where: { id: bundleId },
      include: {
        items: {
          include: {
            listing: true,
          },
        },
      },
    });

    if (!bundle) {
      throw new NotFoundException('Pacote não encontrado');
    }

    if (bundle.buyerId !== buyerId) {
      throw new ForbiddenException('Apenas o comprador pode finalizar o pacote');
    }

    if (bundle.status !== 'OPEN') {
      throw new BadRequestException('Este pacote já foi finalizado');
    }

    // Validate all listings are still active
    const nonActive = bundle.items.filter((i) => i.listing.status !== 'ACTIVE');
    if (nonActive.length > 0) {
      throw new BadRequestException('Um ou mais anúncios do pacote não estão mais disponíveis');
    }

    // Validate address
    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
    });

    if (!address || address.userId !== buyerId) {
      throw new BadRequestException('Endereço de entrega inválido');
    }

    // Calculate combined shipping (single shipping cost based on heaviest item)
    const maxWeight = Math.max(...bundle.items.map((i) => i.listing.shippingWeightG));
    const combinedShippingCost = this.calculateShipping(maxWeight);

    // Create orders in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Double-check all listings are still active
      const freshListings = await tx.listing.findMany({
        where: { id: { in: bundle.items.map((i) => i.listingId) } },
      });

      const stillNonActive = freshListings.filter((l) => l.status !== 'ACTIVE');
      if (stillNonActive.length > 0) {
        throw new BadRequestException('Um ou mais anúncios do pacote já foram vendidos');
      }

      const shippingPerItem = combinedShippingCost / bundle.items.length;
      const orders = [];

      for (const item of bundle.items) {
        const itemPrice = Number(item.listing.priceBrl);
        const buyerProtectionFee =
          BUYER_PROTECTION_FIXED_BRL + itemPrice * BUYER_PROTECTION_RATE;
        const total = itemPrice + shippingPerItem + buyerProtectionFee;

        const order = await tx.order.create({
          data: {
            buyerId,
            sellerId: bundle.sellerId,
            listingId: item.listingId,
            status: 'PENDING',
            totalBrl: new Decimal(total.toFixed(2)),
            itemPriceBrl: item.listing.priceBrl,
            shippingCostBrl: new Decimal(shippingPerItem.toFixed(2)),
            buyerProtectionFeeBrl: new Decimal(buyerProtectionFee.toFixed(2)),
            paymentMethod: paymentMethod as any,
            installments: 1,
          },
          include: {
            listing: {
              include: {
                images: { orderBy: { position: 'asc' }, take: 1 },
              },
            },
          },
        });

        await tx.listing.update({
          where: { id: item.listingId },
          data: { status: 'SOLD' },
        });

        orders.push(order);
      }

      await tx.bundle.update({
        where: { id: bundleId },
        data: { status: 'CHECKED_OUT' },
      });

      return orders;
    });

    // All bundled listings transitioned ACTIVE → SOLD; drop them from search.
    for (const item of bundle.items) {
      this.listings.syncSearchIndex(item.listingId).catch(() => {});
    }

    return {
      bundleId,
      orders: result,
      combinedShippingCostBrl: combinedShippingCost,
    };
  }

  private calculateShipping(weightG: number): number {
    if (weightG <= 300) return 15.9;
    if (weightG <= 1000) return 22.5;
    if (weightG <= 5000) return 35.0;
    return 55.0;
  }
}
