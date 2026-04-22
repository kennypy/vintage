// ============================================================
// Vintage.br — Shared Type Definitions
// ============================================================

// --- Enums ---
//
// Values MUST match the Prisma enum spellings in
// `apps/api/prisma/schema.prisma` (all UPPERCASE). The API returns
// these as UPPERCASE strings in JSON responses; any consumer who
// compares against the enum values below (e.g. `order.status ===
// OrderStatus.PAID`) would silently always be false if the cases
// drifted. If you add a new enum member to the Prisma schema, add it
// here in the same PR — mobile-web parity + shared-package parity
// with the DB is the source-of-truth convention.

export enum ItemCondition {
  NEW_WITH_TAGS = 'NEW_WITH_TAGS',
  NEW_WITHOUT_TAGS = 'NEW_WITHOUT_TAGS',
  VERY_GOOD = 'VERY_GOOD',
  GOOD = 'GOOD',
  SATISFACTORY = 'SATISFACTORY',
}

export enum ListingStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  SOLD = 'SOLD',
  DELETED = 'DELETED',
  // Admin moderation: a listing taken down after a policy review.
  // Mirrored from Prisma schema.prisma enum ListingStatus.
  SUSPENDED = 'SUSPENDED',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  HELD = 'HELD',
  COMPLETED = 'COMPLETED',
  DISPUTED = 'DISPUTED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum ReturnStatus {
  REQUESTED = 'REQUESTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SHIPPED = 'SHIPPED',
  RECEIVED = 'RECEIVED',
  REFUNDED = 'REFUNDED',
  DISPUTED = 'DISPUTED',
}

export enum PaymentMethod {
  PIX = 'PIX',
  CREDIT_CARD = 'CREDIT_CARD',
  BOLETO = 'BOLETO',
  FREE = 'FREE',
}

export enum OfferStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  COUNTERED = 'COUNTERED',
  EXPIRED = 'EXPIRED',
}

export enum DisputeStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
  ESCALATED = 'ESCALATED',
}

export enum DisputeReason {
  NOT_AS_DESCRIBED = 'NOT_AS_DESCRIBED',
  DAMAGED = 'DAMAGED',
  COUNTERFEIT = 'COUNTERFEIT',
  NOT_RECEIVED = 'NOT_RECEIVED',
  WRONG_ITEM = 'WRONG_ITEM',
}

export enum WalletTransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
  PAYOUT = 'PAYOUT',
  REFUND = 'REFUND',
  ESCROW_HOLD = 'ESCROW_HOLD',
  ESCROW_RELEASE = 'ESCROW_RELEASE',
}

export enum PromotionType {
  BUMP = 'BUMP',
  SPOTLIGHT = 'SPOTLIGHT',
  MEGAFONE = 'MEGAFONE',
}

// Notification kinds surfaced to the client. There is no DB-level
// enum for this (Notification.type is a plain String column) so the
// only constraint is that producers and consumers agree; keep
// UPPERCASE to stay consistent with every other enum in this file.
export enum NotificationType {
  ORDER_UPDATE = 'ORDER_UPDATE',
  NEW_MESSAGE = 'NEW_MESSAGE',
  NEW_OFFER = 'NEW_OFFER',
  OFFER_ACCEPTED = 'OFFER_ACCEPTED',
  NEW_FOLLOWER = 'NEW_FOLLOWER',
  PRICE_DROP = 'PRICE_DROP',
  SAVED_SEARCH_MATCH = 'SAVED_SEARCH_MATCH',
  REVIEW_RECEIVED = 'REVIEW_RECEIVED',
  PAYOUT_COMPLETED = 'PAYOUT_COMPLETED',
}

export enum Carrier {
  CORREIOS = 'CORREIOS',
  SEDEX = 'SEDEX',
  PAC = 'PAC',
  JADLOG = 'JADLOG',
  KANGU = 'KANGU',
  // PegakiClient is wired in ShippingService (see
  // apps/api/src/shipping/shipping.service.ts) and real orders can
  // be labelled with this carrier.
  PEGAKI = 'PEGAKI',
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

export enum NFeStatus {
  PENDING = 'PENDING',
  AUTHORIZED = 'AUTHORIZED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

// --- API Types ---

export interface User {
  id: string;
  email: string;
  cpf: string;
  cnpj?: string;
  cnpjVerified?: boolean;
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
  shippingAddressId: string | null;
  carrier: Carrier | null;
  installments: number;
  shippedAt: string | null;
  deliveredAt: string | null;
  confirmedAt: string | null;
  disputeDeadline: string | null;
  escrowReleasesAt: string | null;
  createdAt: string;
}

export interface Payment {
  id: string;
  orderId: string;
  attemptNumber: number;
  parentPaymentId: string | null;
  providerPaymentId: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  amountBrl: number;
  failureReason: string | null;
  createdAt: string;
}

export interface Return {
  id: string;
  orderId: string;
  requestedById: string;
  status: ReturnStatus;
  reason: DisputeReason;
  description: string;
  returnTrackingCode: string | null;
  returnCarrier: Carrier | null;
  returnLabelUrl: string | null;
  rejectionReason: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  inspectedAt: string | null;
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
  parentOfferId: string | null;
  counterCount: number;
  counteredById: string | null;
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

export interface NotaFiscal {
  id: string;
  orderId: string;
  nfeId: string | null;
  accessKey: string | null;
  pdfUrl: string | null;
  status: NFeStatus;
  sellerCnpj: string | null;
  buyerCpf: string | null;
  originState: string;
  destinationState: string;
  icmsBrl: number;
  issBrl: number;
  totalTaxBrl: number;
  issuedAt: string | null;
  createdAt: string;
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

// --- Feature Flags ---

export interface FeatureFlag {
  id: string;
  key: string;
  enabled: boolean;
  description: string | null;
  metadata: Record<string, unknown> | null;
  updatedAt: string;
}

// --- Coupons ---

export interface CouponValidationResult {
  valid: boolean;
  couponId: string;
  code: string;
  discountPct: number;
  discountBrl: number;
}
