import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Weights for the Sellability Score composite metric */
const SCORE_WEIGHT_VIEWS = 0.15;
const SCORE_WEIGHT_FAVORITES = 0.35;
const SCORE_WEIGHT_SALES_RATE = 0.50;

@Injectable()
export class SellerInsightsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Full seller analytics dashboard.
   * Includes: overview stats, per-listing performance, Sellability Score,
   * average time-to-sell by category, and demand trend signals.
   */
  async getDashboard(sellerId: string) {
    const [overview, listingPerformance, timeToSellByCategory, topCategories] =
      await Promise.all([
        this.getOverview(sellerId),
        this.getListingPerformance(sellerId),
        this.getTimeToSellByCategory(sellerId),
        this.getTopDemandCategories(sellerId),
      ]);

    return {
      overview,
      listingPerformance,
      timeToSellByCategory,
      topCategories,
    };
  }

  /** Overview totals: sales count, revenue, active listings, avg sale price, avg rating */
  private async getOverview(sellerId: string) {
    const [completedOrders, activeListings, ratingStats] = await Promise.all([
      this.prisma.order.findMany({
        where: { sellerId, status: 'COMPLETED' },
        select: { itemPriceBrl: true, createdAt: true },
      }),
      this.prisma.listing.count({ where: { sellerId, status: 'ACTIVE' } }),
      this.prisma.user.findUnique({
        where: { id: sellerId },
        select: { ratingAvg: true, ratingCount: true },
      }),
    ]);

    const totalRevenueBrl = completedOrders.reduce(
      (sum, o) => sum + Number(o.itemPriceBrl),
      0,
    );

    return {
      totalSales: completedOrders.length,
      totalRevenueBrl: Math.round(totalRevenueBrl * 100) / 100,
      avgSalePriceBrl:
        completedOrders.length > 0
          ? Math.round((totalRevenueBrl / completedOrders.length) * 100) / 100
          : 0,
      activeListings,
      ratingAvg: ratingStats?.ratingAvg ?? 0,
      ratingCount: ratingStats?.ratingCount ?? 0,
    };
  }

  /**
   * Per-listing performance: views, favorites, sold status, sellability score.
   * Returns top 20 listings by score (active + sold from last 90 days).
   */
  private async getListingPerformance(sellerId: string) {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const listings = await this.prisma.listing.findMany({
      where: {
        sellerId,
        status: { in: ['ACTIVE', 'PAUSED', 'SOLD'] },
        createdAt: { gte: since },
      },
      select: {
        id: true,
        title: true,
        priceBrl: true,
        status: true,
        viewCount: true,
        favoriteCount: true,
        createdAt: true,
        isAuthentic: true,
        images: { take: 1 },
        priceSuggestion: { select: { suggestedBrl: true } },
        orders: {
          where: { status: 'COMPLETED' },
          select: { createdAt: true },
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return listings.map((l) => {
      const isSold = l.status === 'SOLD';
      const soldAt = l.orders[0]?.createdAt;
      const daysToSell = soldAt
        ? Math.round((soldAt.getTime() - l.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Sellability Score: normalized 0–100
      const viewScore = Math.min(l.viewCount / 100, 1) * SCORE_WEIGHT_VIEWS;
      const favScore = Math.min(l.favoriteCount / 10, 1) * SCORE_WEIGHT_FAVORITES;
      const salesScore = isSold ? SCORE_WEIGHT_SALES_RATE : 0;
      const sellabilityScore = Math.round((viewScore + favScore + salesScore) * 100);

      // Price vs suggestion
      const suggested = l.priceSuggestion?.suggestedBrl
        ? Number(l.priceSuggestion.suggestedBrl)
        : null;
      const priceDiffPct =
        suggested && suggested > 0
          ? Math.round(((Number(l.priceBrl) - suggested) / suggested) * 100)
          : null;

      return {
        id: l.id,
        title: l.title,
        priceBrl: Number(l.priceBrl),
        status: l.status,
        viewCount: l.viewCount,
        favoriteCount: l.favoriteCount,
        sellabilityScore,
        daysToSell,
        thumbnailUrl: l.images[0]?.url ?? null,
        suggestedPriceBrl: suggested,
        priceDiffPct, // positive = priced above suggestion, negative = below
        isAuthentic: l.isAuthentic,
      };
    });
  }

  /** Average days-to-sell per category for this seller */
  private async getTimeToSellByCategory(sellerId: string) {
    const soldOrders = await this.prisma.order.findMany({
      where: { sellerId, status: 'COMPLETED' },
      select: {
        createdAt: true,
        listing: {
          select: {
            createdAt: true,
            category: { select: { id: true, namePt: true } },
          },
        },
      },
    });

    const byCategory: Record<string, { name: string; total: number; count: number }> = {};

    for (const order of soldOrders) {
      const catId = order.listing.category.id;
      const catName = order.listing.category.namePt;
      const days = Math.round(
        (order.createdAt.getTime() - order.listing.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (!byCategory[catId]) {
        byCategory[catId] = { name: catName, total: 0, count: 0 };
      }
      byCategory[catId].total += days;
      byCategory[catId].count += 1;
    }

    return Object.entries(byCategory)
      .map(([categoryId, v]) => ({
        categoryId,
        categoryName: v.name,
        avgDaysToSell: Math.round(v.total / v.count),
        salesCount: v.count,
      }))
      .sort((a, b) => a.avgDaysToSell - b.avgDaysToSell);
  }

  /**
   * Top demand categories — derived from favorites/views on seller's active listings.
   * Signals which categories are getting the most interest right now.
   */
  private async getTopDemandCategories(sellerId: string) {
    const activeListings = await this.prisma.listing.findMany({
      where: { sellerId, status: 'ACTIVE' },
      select: {
        viewCount: true,
        favoriteCount: true,
        category: { select: { id: true, namePt: true } },
      },
    });

    const scores: Record<string, { name: string; viewTotal: number; favTotal: number; count: number }> = {};

    for (const l of activeListings) {
      const catId = l.category.id;
      if (!scores[catId]) {
        scores[catId] = { name: l.category.namePt, viewTotal: 0, favTotal: 0, count: 0 };
      }
      scores[catId].viewTotal += l.viewCount;
      scores[catId].favTotal += l.favoriteCount;
      scores[catId].count += 1;
    }

    return Object.entries(scores)
      .map(([categoryId, v]) => ({
        categoryId,
        categoryName: v.name,
        listingCount: v.count,
        totalViews: v.viewTotal,
        totalFavorites: v.favTotal,
        demandScore: v.viewTotal * SCORE_WEIGHT_VIEWS + v.favTotal * SCORE_WEIGHT_FAVORITES,
      }))
      .sort((a, b) => b.demandScore - a.demandScore)
      .slice(0, 5);
  }
}
