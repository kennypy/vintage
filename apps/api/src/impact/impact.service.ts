import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Environmental impact constants (based on industry averages from
 * Fashion Revolution / WRAP / Repassa annual ESG reports).
 * Per secondhand garment transaction vs. buying new.
 */
const CO2_SAVED_PER_ITEM_KG = 1.3;       // kg CO2e saved
const WATER_SAVED_PER_ITEM_LITERS = 2700; // liters of water saved

/** Badge tiers by total items sold / purchased (circular actions) */
const BADGE_TIERS = [
  { minItems: 100, badge: 'Campeã do Círculo', emoji: '🌍' },
  { minItems: 50,  badge: 'Eco Herói',         emoji: '♻️' },
  { minItems: 10,  badge: 'Em Circulação',      emoji: '🌱' },
  { minItems: 1,   badge: 'Primeiros Passos',   emoji: '👣' },
] as const;

function getBadge(totalItems: number): { badge: string; emoji: string } | null {
  for (const tier of BADGE_TIERS) {
    if (totalItems >= tier.minItems) {
      return { badge: tier.badge, emoji: tier.emoji };
    }
  }
  return null;
}

function getNextBadge(totalItems: number): { badge: string; emoji: string; itemsNeeded: number } | null {
  // Find the next tier above current
  for (let i = BADGE_TIERS.length - 1; i >= 0; i--) {
    if (totalItems < BADGE_TIERS[i].minItems) {
      return {
        badge: BADGE_TIERS[i].badge,
        emoji: BADGE_TIERS[i].emoji,
        itemsNeeded: BADGE_TIERS[i].minItems - totalItems,
      };
    }
  }
  return null; // already at max tier
}

@Injectable()
export class ImpactService {
  constructor(private prisma: PrismaService) {}

  /**
   * Environmental impact for a single completed order.
   * Used on order confirmation screen.
   */
  async getOrderImpact(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { buyerId: true, sellerId: true, status: true },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return {
      orderId,
      co2SavedKg: CO2_SAVED_PER_ITEM_KG,
      waterSavedLiters: WATER_SAVED_PER_ITEM_LITERS,
      message: `Esta transação economizou ${WATER_SAVED_PER_ITEM_LITERS.toLocaleString('pt-BR')} litros de água e evitou ${CO2_SAVED_PER_ITEM_KG}kg de CO₂ vs. comprar novo.`,
    };
  }

  /**
   * Cumulative circular economy impact for a user (as seller + buyer combined).
   * Used on user profile page.
   */
  async getUserImpact(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    // Count completed transactions (as seller + as buyer)
    const [soldCount, boughtCount] = await Promise.all([
      this.prisma.order.count({ where: { sellerId: userId, status: 'COMPLETED' } }),
      this.prisma.order.count({ where: { buyerId: userId, status: 'COMPLETED' } }),
    ]);

    const totalItems = soldCount + boughtCount;
    const co2SavedKg = Math.round(totalItems * CO2_SAVED_PER_ITEM_KG * 10) / 10;
    const waterSavedLiters = totalItems * WATER_SAVED_PER_ITEM_LITERS;

    const currentBadge = getBadge(totalItems);
    const nextBadge = getNextBadge(totalItems);

    return {
      userId,
      totalItemsCirculated: totalItems,
      itemsSold: soldCount,
      itemsBought: boughtCount,
      co2SavedKg,
      waterSavedLiters,
      // Equivalencies for UI display
      equivalencies: {
        treesPlanted: Math.round(co2SavedKg / 21), // avg tree absorbs ~21kg CO2/year
        showersSaved: Math.round(waterSavedLiters / 65), // avg shower ~65L
      },
      currentBadge,
      nextBadge,
      allTiers: BADGE_TIERS.map((t) => ({
        badge: t.badge,
        emoji: t.emoji,
        minItems: t.minItems,
        unlocked: totalItems >= t.minItems,
      })),
    };
  }

  /**
   * Platform-wide cumulative impact stats (public, for marketing/homepage).
   */
  async getPlatformImpact() {
    const totalCompleted = await this.prisma.order.count({ where: { status: 'COMPLETED' } });

    const co2SavedKg = Math.round(totalCompleted * CO2_SAVED_PER_ITEM_KG);
    const waterSavedLiters = totalCompleted * WATER_SAVED_PER_ITEM_LITERS;

    return {
      totalTransactions: totalCompleted,
      co2SavedKg,
      waterSavedLiters,
      equivalencies: {
        treesPlanted: Math.round(co2SavedKg / 21),
        olympicPoolsFilled: Math.round(waterSavedLiters / 2_500_000),
      },
    };
  }
}
