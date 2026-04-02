import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [totalUsers, totalListings, activeListings, completedOrders] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.listing.count(),
        this.prisma.listing.count({ where: { status: 'ACTIVE' } }),
        this.prisma.order.count({ where: { status: 'COMPLETED' } }),
      ]);

    const revenueResult = await this.prisma.order.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { totalBrl: true },
    });

    const totalRevenueBrl = Number(revenueResult._sum.totalBrl ?? 0);

    const pendingOrders = await this.prisma.order.count({
      where: { status: { in: ['PENDING', 'PAID', 'SHIPPED'] } },
    });

    const bannedUsers = await this.prisma.user.count({
      where: { isBanned: true },
    });

    return {
      totalUsers,
      bannedUsers,
      totalListings,
      activeListings,
      completedOrders,
      pendingOrders,
      totalRevenueBrl,
    };
  }

  async getSales(page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { status: 'COMPLETED' },
        orderBy: { confirmedAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          buyer: { select: { id: true, name: true, email: true } },
          seller: { select: { id: true, name: true, email: true } },
          listing: {
            select: {
              id: true,
              title: true,
              categoryId: true,
              category: { select: { id: true, namePt: true } },
              brandId: true,
              brand: { select: { id: true, name: true } },
              condition: true,
              size: true,
            },
          },
        },
      }),
      this.prisma.order.count({ where: { status: 'COMPLETED' } }),
    ]);

    return {
      items: items.map((o) => ({
        id: o.id,
        itemPriceBrl: Number(o.itemPriceBrl),
        totalBrl: Number(o.totalBrl),
        shippingCostBrl: Number(o.shippingCostBrl),
        discountBrl: o.discountBrl ? Number(o.discountBrl) : null,
        paymentMethod: o.paymentMethod,
        confirmedAt: o.confirmedAt,
        createdAt: o.createdAt,
        buyer: o.buyer,
        seller: o.seller,
        listing: o.listing,
      })),
      total,
      page,
      pageSize,
      hasMore: skip + pageSize < total,
    };
  }

  async getSalesByCategory() {
    const orders = await this.prisma.order.findMany({
      where: { status: 'COMPLETED' },
      select: {
        itemPriceBrl: true,
        createdAt: true,
        listing: {
          select: {
            categoryId: true,
            category: { select: { namePt: true } },
            createdAt: true,
          },
        },
      },
    });

    const categoryMap = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        totalSales: number;
        totalRevenueBrl: number;
        totalDaysToSell: number;
      }
    >();

    for (const order of orders) {
      const catId = order.listing.categoryId;
      const catName = order.listing.category?.namePt ?? 'Sem categoria';
      const price = Number(order.itemPriceBrl);
      const daysToSell = Math.max(
        1,
        Math.ceil(
          (order.createdAt.getTime() - order.listing.createdAt.getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      );

      const existing = categoryMap.get(catId);
      if (existing) {
        existing.totalSales += 1;
        existing.totalRevenueBrl += price;
        existing.totalDaysToSell += daysToSell;
      } else {
        categoryMap.set(catId, {
          categoryId: catId,
          categoryName: catName,
          totalSales: 1,
          totalRevenueBrl: price,
          totalDaysToSell: daysToSell,
        });
      }
    }

    return Array.from(categoryMap.values())
      .map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        totalSales: c.totalSales,
        totalRevenueBrl: c.totalRevenueBrl,
        avgPriceBrl: c.totalRevenueBrl / c.totalSales,
        avgDaysToSell: c.totalDaysToSell / c.totalSales,
      }))
      .sort((a, b) => b.totalSales - a.totalSales);
  }

  async getPricingData() {
    const orders = await this.prisma.order.findMany({
      where: { status: 'COMPLETED' },
      select: {
        itemPriceBrl: true,
        listing: {
          select: {
            categoryId: true,
            category: { select: { namePt: true } },
            condition: true,
            brandId: true,
            brand: { select: { name: true } },
          },
        },
      },
    });

    const pricingMap = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        condition: string;
        brandName: string | null;
        prices: number[];
      }
    >();

    for (const order of orders) {
      const key = `${order.listing.categoryId}|${order.listing.condition}|${order.listing.brandId ?? 'none'}`;
      const price = Number(order.itemPriceBrl);

      const existing = pricingMap.get(key);
      if (existing) {
        existing.prices.push(price);
      } else {
        pricingMap.set(key, {
          categoryId: order.listing.categoryId,
          categoryName: order.listing.category?.namePt ?? 'Sem categoria',
          condition: order.listing.condition,
          brandName: order.listing.brand?.name ?? null,
          prices: [price],
        });
      }
    }

    return Array.from(pricingMap.values())
      .map((entry) => {
        const sorted = entry.prices.sort((a, b) => a - b);
        const sum = sorted.reduce((a, b) => a + b, 0);
        return {
          categoryId: entry.categoryId,
          categoryName: entry.categoryName,
          condition: entry.condition,
          brandName: entry.brandName,
          count: sorted.length,
          avgPriceBrl: sum / sorted.length,
          minPriceBrl: sorted[0],
          maxPriceBrl: sorted[sorted.length - 1],
          medianPriceBrl:
            sorted.length % 2 === 0
              ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
              : sorted[Math.floor(sorted.length / 2)],
        };
      })
      .sort((a, b) => b.count - a.count);
  }
}
