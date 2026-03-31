import { Injectable, Logger } from '@nestjs/common';
import { UserEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Weight of each event type when scoring interest in a category/brand
const EVENT_WEIGHTS: Partial<Record<UserEventType, number>> = {
  [UserEventType.LISTING_VIEW]: 0.1,
  [UserEventType.LISTING_FAVORITE]: 0.5,
  [UserEventType.LISTING_UNFAVORITE]: -0.3,
  [UserEventType.OFFER_MADE]: 1.0,
  [UserEventType.ORDER_COMPLETE]: 2.0,
  [UserEventType.SEARCH]: 0.2,
  [UserEventType.CATEGORY_BROWSE]: 0.15,
  [UserEventType.BRAND_BROWSE]: 0.15,
};

// Events older than 90 days contribute less (exponential decay applied elsewhere)
const EVENT_LOOKBACK_DAYS = 90;

// Minimum user cohort size for anonymised audience export (k-anonymity)
export const MIN_COHORT_SIZE = 50;

@Injectable()
export class AudienceService {
  private readonly logger = new Logger(AudienceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Rebuild the ad profile for a single user from their raw events
  async computeProfile(userId: string): Promise<void> {
    const since = new Date(
      Date.now() - EVENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );

    const events = await this.prisma.userEvent.findMany({
      where: { userId, createdAt: { gte: since } },
      select: {
        eventType: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
      },
    });

    const categoryScores: Record<string, number> = {};
    const brandScores: Record<string, number> = {};
    const hourCounts: Record<string, number> = {};
    const sizes = new Set<string>();
    const colors = new Set<string>();
    const priceSamples: number[] = [];

    const now = Date.now();

    for (const ev of events) {
      const weight = EVENT_WEIGHTS[ev.eventType] ?? 0;
      // Exponential decay — events decay to ~50% at 30 days
      const ageMs = now - new Date(ev.createdAt).getTime();
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      const decay = Math.exp(-0.023 * ageDays); // ln(2)/30 ≈ 0.023
      const effectiveWeight = weight * decay;

      if (ev.entityType === 'category' && ev.entityId) {
        categoryScores[ev.entityId] =
          (categoryScores[ev.entityId] ?? 0) + effectiveWeight;
      }
      if (ev.entityType === 'brand' && ev.entityId) {
        brandScores[ev.entityId] =
          (brandScores[ev.entityId] ?? 0) + effectiveWeight;
      }

      // Extract size/colour/price from event metadata when available
      const meta = ev.metadata as Record<string, unknown>;
      if (typeof meta?.size === 'string' && meta.size.length <= 8) {
        sizes.add(meta.size);
      }
      if (typeof meta?.color === 'string' && meta.color.length <= 32) {
        colors.add(meta.color);
      }
      if (typeof meta?.priceBrl === 'number' && meta.priceBrl > 0) {
        priceSamples.push(meta.priceBrl);
      }

      // Track hour-of-day activity
      const hour = new Date(ev.createdAt).getHours().toString();
      hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
    }

    // Derive price range from the 10th–90th percentile of sampled prices
    let priceRangeLow: number | null = null;
    let priceRangeHigh: number | null = null;
    if (priceSamples.length >= 3) {
      priceSamples.sort((a, b) => a - b);
      const p10 = Math.floor(priceSamples.length * 0.1);
      const p90 = Math.floor(priceSamples.length * 0.9);
      priceRangeLow = priceSamples[p10];
      priceRangeHigh = priceSamples[p90];
    }

    // Build interest tags from top-3 categories and top-3 brands
    const topCategories = Object.entries(categoryScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([id]) => `cat:${id}`);
    const topBrands = Object.entries(brandScores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([id]) => `brand:${id}`);
    const interestTags = [...topCategories, ...topBrands];

    await this.prisma.userAdProfile.upsert({
      where: { userId },
      create: {
        userId,
        categoryScores,
        brandScores,
        priceRangeLow,
        priceRangeHigh,
        preferredSizes: Array.from(sizes),
        preferredColors: Array.from(colors),
        activeHours: hourCounts,
        interestTags,
        lastComputedAt: new Date(),
      },
      update: {
        categoryScores,
        brandScores,
        priceRangeLow,
        priceRangeHigh,
        preferredSizes: Array.from(sizes),
        preferredColors: Array.from(colors),
        activeHours: hourCounts,
        interestTags,
        lastComputedAt: new Date(),
      },
    });
  }

  // Get a user's own profile (safe for user-facing API)
  async getProfile(userId: string) {
    return this.prisma.userAdProfile.findUnique({
      where: { userId },
      select: {
        categoryScores: true,
        brandScores: true,
        priceRangeLow: true,
        priceRangeHigh: true,
        preferredSizes: true,
        preferredColors: true,
        interestTags: true,
        lastComputedAt: true,
      },
    });
  }

  // Match a campaign's targetAudience criteria against a user's profile
  // Returns a 0–1 relevance score
  async scoreRelevance(
    userId: string,
    targetAudience: Record<string, unknown>,
  ): Promise<number> {
    const profile = await this.prisma.userAdProfile.findUnique({
      where: { userId },
    });
    if (!profile) return 0;

    let score = 0;
    let checks = 0;

    const catScores = profile.categoryScores as Record<string, number>;
    const brandScores = profile.brandScores as Record<string, number>;

    // Category targeting
    if (Array.isArray(targetAudience.categoryIds)) {
      const ids = targetAudience.categoryIds as string[];
      const matched = ids.filter((id) => (catScores[id] ?? 0) > 0.5).length;
      score += matched / Math.max(ids.length, 1);
      checks++;
    }

    // Brand targeting
    if (Array.isArray(targetAudience.brandIds)) {
      const ids = targetAudience.brandIds as string[];
      const matched = ids.filter((id) => (brandScores[id] ?? 0) > 0.5).length;
      score += matched / Math.max(ids.length, 1);
      checks++;
    }

    // Price range overlap
    if (
      typeof targetAudience.priceMin === 'number' &&
      typeof targetAudience.priceMax === 'number' &&
      profile.priceRangeLow !== null &&
      profile.priceRangeHigh !== null
    ) {
      const pMin = Number(profile.priceRangeLow);
      const pMax = Number(profile.priceRangeHigh);
      const tMin = targetAudience.priceMin as number;
      const tMax = targetAudience.priceMax as number;
      const overlap = Math.max(0, Math.min(pMax, tMax) - Math.max(pMin, tMin));
      const range = Math.max(pMax - pMin, tMax - tMin, 1);
      score += overlap / range;
      checks++;
    }

    return checks > 0 ? score / checks : 0;
  }

  // Build an anonymised audience segment for third-party data export
  // Enforces k-anonymity: only returns cohorts with ≥ MIN_COHORT_SIZE users
  async buildAnonymisedSegment(criteria: {
    categoryIds?: string[];
    brandIds?: string[];
    priceMin?: number;
    priceMax?: number;
  }): Promise<{
    cohortSize: number;
    ageRangePct: Record<string, number>; // placeholder — no DOB in schema
    topCategoryIds: string[];
    topBrandIds: string[];
    priceRangeLow: number;
    priceRangeHigh: number;
    activeHourPeak: number;
  } | null> {
    // Fetch all profiles with matching interests
    const profiles = await this.prisma.userAdProfile.findMany({
      select: {
        categoryScores: true,
        brandScores: true,
        priceRangeLow: true,
        priceRangeHigh: true,
        activeHours: true,
      },
    });

    // Filter by criteria
    const matching = profiles.filter((p) => {
      const cats = p.categoryScores as Record<string, number>;
      const brands = p.brandScores as Record<string, number>;

      if (criteria.categoryIds?.length) {
        const hit = criteria.categoryIds.some((id) => (cats[id] ?? 0) > 0.3);
        if (!hit) return false;
      }
      if (criteria.brandIds?.length) {
        const hit = criteria.brandIds.some((id) => (brands[id] ?? 0) > 0.3);
        if (!hit) return false;
      }
      if (
        criteria.priceMin !== undefined &&
        p.priceRangeLow !== null &&
        Number(p.priceRangeLow) < criteria.priceMin
      ) {
        return false;
      }
      if (
        criteria.priceMax !== undefined &&
        p.priceRangeHigh !== null &&
        Number(p.priceRangeHigh) > criteria.priceMax
      ) {
        return false;
      }
      return true;
    });

    // Enforce k-anonymity
    if (matching.length < MIN_COHORT_SIZE) return null;

    // Aggregate — never include individual user data
    const catAgg: Record<string, number> = {};
    const brandAgg: Record<string, number> = {};
    const hourAgg: Record<string, number> = {};
    const prices: number[] = [];

    for (const p of matching) {
      for (const [id, s] of Object.entries(p.categoryScores as Record<string, number>)) {
        catAgg[id] = (catAgg[id] ?? 0) + s;
      }
      for (const [id, s] of Object.entries(p.brandScores as Record<string, number>)) {
        brandAgg[id] = (brandAgg[id] ?? 0) + s;
      }
      for (const [h, c] of Object.entries(p.activeHours as Record<string, number>)) {
        hourAgg[h] = (hourAgg[h] ?? 0) + c;
      }
      if (p.priceRangeLow !== null) prices.push(Number(p.priceRangeLow));
      if (p.priceRangeHigh !== null) prices.push(Number(p.priceRangeHigh));
    }

    const topCategoryIds = Object.entries(catAgg)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id]) => id);
    const topBrandIds = Object.entries(brandAgg)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id]) => id);
    const peakHour = parseInt(
      Object.entries(hourAgg).sort(([, a], [, b]) => b - a)[0]?.[0] ?? '12',
    );

    prices.sort((a, b) => a - b);
    const p10 = prices[Math.floor(prices.length * 0.1)] ?? 0;
    const p90 = prices[Math.floor(prices.length * 0.9)] ?? 0;

    return {
      cohortSize: matching.length,
      ageRangePct: {}, // no DOB stored — compliance-safe
      topCategoryIds,
      topBrandIds,
      priceRangeLow: p10,
      priceRangeHigh: p90,
      activeHourPeak: peakHour,
    };
  }
}
