import { apiFetch } from './api';

export interface SellerDashboardOverview {
  totalSales: number;
  totalRevenueBrl: number;
  avgSalePriceBrl: number;
  activeListings: number;
  ratingAvg: number;
  ratingCount: number;
}

export interface ListingPerformance {
  id: string;
  title: string;
  priceBrl: number;
  status: string;
  viewCount: number;
  favoriteCount: number;
  sellabilityScore: number;
  daysToSell: number | null;
  thumbnailUrl: string | null;
  suggestedPriceBrl: number | null;
  priceDiffPct: number | null;
  isAuthentic: boolean;
}

export interface CategoryTimeToSell {
  categoryId: string;
  categoryName: string;
  avgDaysToSell: number;
  salesCount: number;
}

export interface TopDemandCategory {
  categoryId: string;
  categoryName: string;
  listingCount: number;
  totalViews: number;
  totalFavorites: number;
  demandScore: number;
}

export interface SellerDashboard {
  overview: SellerDashboardOverview;
  listingPerformance: ListingPerformance[];
  timeToSellByCategory: CategoryTimeToSell[];
  topCategories: TopDemandCategory[];
}

export async function getSellerDashboard(): Promise<SellerDashboard> {
  return apiFetch<SellerDashboard>('/seller-insights');
}
