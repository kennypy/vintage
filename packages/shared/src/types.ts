// ============================================================
// Vintage.br — Shared Type Definitions
// ============================================================

// --- Enums ---

export enum ItemCondition {
  NEW_WITH_TAGS = 'new_with_tags',
  NEW_WITHOUT_TAGS = 'new_without_tags',
  VERY_GOOD = 'very_good',
  GOOD = 'good',
  SATISFACTORY = 'satisfactory',
}

export enum ListingStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  SOLD = 'sold',
  DELETED = 'deleted',
}

export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  DISPUTED = 'disputed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}

export enum PaymentMethod {
  PIX = 'pix',
  CREDIT_CARD = 'credit_card',
  BOLETO = 'boleto',
  FREE = 'free',
}

export enum OfferStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  COUNTERED = 'countered',
  EXPIRED = 'expired',
}

export enum DisputeStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
  ESCALATED = 'escalated',
}

export enum DisputeReason {
  NOT_AS_DESCRIBED = 'not_as_described',
  DAMAGED = 'damaged',
  COUNTERFEIT = 'counterfeit',
  NOT_RECEIVED = 'not_received',
  WRONG_ITEM = 'wrong_item',
}

export enum WalletTransactionType {
  CREDIT = 'credit',
  DEBIT = 'debit',
  PAYOUT = 'payout',
  REFUND = 'refund',
  ESCROW_HOLD = 'escrow_hold',
  ESCROW_RELEASE = 'escrow_release',
}

export enum PromotionType {
  BUMP = 'bump',
  SPOTLIGHT = 'spotlight',
  MEGAFONE = 'megafone',
}

export enum NotificationType {
  ORDER_UPDATE = 'order_update',
  NEW_MESSAGE = 'new_message',
  NEW_OFFER = 'new_offer',
  OFFER_ACCEPTED = 'offer_accepted',
  NEW_FOLLOWER = 'new_follower',
  PRICE_DROP = 'price_drop',
  SAVED_SEARCH_MATCH = 'saved_search_match',
  REVIEW_RECEIVED = 'review_received',
  PAYOUT_COMPLETED = 'payout_completed',
}

export enum Carrier {
  CORREIOS = 'correios',
  JADLOG = 'jadlog',
}

// --- Brazilian Sizes ---

export enum ClothingSize {
  PP = 'PP',
  P = 'P',
  M = 'M',
  G = 'G',
  GG = 'GG',
  XG = 'XG',
  XXG = 'XXG',
}

// --- API Types ---

export interface User {
  id: string;
  email: string;
  cpf: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  bio: string | null;
  verified: boolean;
  vacationMode: boolean;
  vacationUntil: string | null;
  ratingAvg: number;
  ratingCount: number;
  followerCount: number;
  followingCount: number;
  createdAt: string;
}

export interface Listing {
  id: string;
  sellerId: string;
  seller?: User;
  title: string;
  description: string;
  categoryId: string;
  category?: Category;
  brandId: string | null;
  brand?: Brand;
  condition: ItemCondition;
  size: string | null;
  color: string | null;
  priceBrl: number;
  shippingWeightG: number;
  status: ListingStatus;
  images: ListingImage[];
  promotedUntil: string | null;
  favoriteCount: number;
  viewCount: number;
  createdAt: string;
}

export interface ListingImage {
  id: string;
  url: string;
  position: number;
  width: number;
  height: number;
}

export interface Category {
  id: string;
  parentId: string | null;
  namePt: string;
  slug: string;
  icon: string | null;
  children?: Category[];
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  verified: boolean;
}

export interface Order {
  id: string;
  buyerId: string;
  buyer?: User;
  sellerId: string;
  seller?: User;
  listingId: string;
  listing?: Listing;
  status: OrderStatus;
  totalBrl: number;
  itemPriceBrl: number;
  shippingCostBrl: number;
  buyerProtectionFeeBrl: number;
  paymentMethod: PaymentMethod;
  paymentId: string | null;
  shippingLabelUrl: string | null;
  trackingCode: string | null;
  carrier: Carrier | null;
  installments: number;
  shippedAt: string | null;
  deliveredAt: string | null;
  confirmedAt: string | null;
  disputeDeadline: string | null;
  createdAt: string;
}

export interface Offer {
  id: string;
  listingId: string;
  listing?: Listing;
  buyerId: string;
  buyer?: User;
  amountBrl: number;
  status: OfferStatus;
  expiresAt: string;
  createdAt: string;
}

export interface Wallet {
  id: string;
  userId: string;
  balanceBrl: number;
  pendingBrl: number;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: WalletTransactionType;
  amountBrl: number;
  referenceId: string | null;
  description: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  participant1Id: string;
  participant2Id: string;
  orderId: string | null;
  lastMessageAt: string;
  otherUser?: User;
  lastMessage?: Message;
  unreadCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface Review {
  id: string;
  orderId: string;
  reviewerId: string;
  reviewer?: User;
  reviewedId: string;
  rating: 1 | 5;
  comment: string | null;
  createdAt: string;
}

export interface Dispute {
  id: string;
  orderId: string;
  openedById: string;
  reason: DisputeReason;
  description: string;
  status: DisputeStatus;
  resolution: string | null;
  createdAt: string;
}

export interface Address {
  id: string;
  userId: string;
  label: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  isDefault: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

// --- API Request/Response Types ---

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ShippingRate {
  carrier: Carrier;
  serviceName: string;
  priceBrl: number;
  estimatedDays: number;
}

export interface BuyerProtectionFee {
  fixedBrl: number;
  percentageRate: number;
  totalBrl: number;
}

export interface CheckoutSummary {
  itemPriceBrl: number;
  shippingCostBrl: number;
  buyerProtectionFeeBrl: number;
  totalBrl: number;
  installmentOptions: InstallmentOption[];
}

export interface InstallmentOption {
  installments: number;
  installmentAmountBrl: number;
  totalBrl: number;
  interestRate: number;
}

export interface PixPaymentData {
  qrCode: string;
  qrCodeBase64: string;
  pixCopiaECola: string;
  expiresAt: string;
}

// --- Coupons ---

export interface CouponValidationResult {
  valid: boolean;
  couponId: string;
  code: string;
  discountPct: number;
  discountBrl: number;
}
