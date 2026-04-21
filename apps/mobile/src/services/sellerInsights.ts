import { apiFetch } from './api';

export interface SellerDashboardOverview {
  totalSales: number;
  totalRevenueBrl: number;
  activeListings: number;
  avgSalePriceBrl: number;
  ratingAvg: number;
  ratingCount: number;
}

export interface ListingPerformance {
  listingId: string;
  title: string;
  priceBrl: number;
  viewCount: number;
  favoriteCount: number;
  status: string;
  sellabilityScore: number;
  imageUrl?: string;
}

export interface CategoryTimeToSell {
  categoryId: string;
  categoryName: string;
  avgDays: number;
}

export interface TopCategory {
  categoryId: string;
  categoryName: string;
  score: number;
}

export interface SellerDashboard {
  overview: SellerDashboardOverview;
  listingPerformance: ListingPerformance[];
  timeToSellByCategory: CategoryTimeToSell[];
  topCategories: TopCategory[];
}

export async function getSellerDashboard(): Promise<SellerDashboard> {
  return apiFetch<SellerDashboard>('/seller-insights');
}
