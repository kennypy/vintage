// ============================================================
// Vintage.br — API Response DTOs (canonical contract)
// ============================================================
//
// These shapes mirror the JSON the NestJS API returns for the most
// commonly consumed endpoints. They are the SINGLE SOURCE OF TRUTH —
// mobile and web clients MUST import from here rather than redeclare
// their own copies. When the API contract changes, update this file
// and consumers get type errors at the next build, surfacing every
// drifted call-site.
//
// Naming convention: <Verb><Noun>Response (e.g. CreateListingResponse,
// GetOrderResponse). Paginated lists use Paginated<T> from `./types`.

import type {
  Address,
  Brand,
  Category,
  Conversation,
  FeatureFlag,
  Listing,
  Message,
  Notification,
  Offer,
  Order,
  PaginatedResponse,
  Payment,
  Review,
  User,
  Wallet,
  WalletTransaction,
} from './types';

// ----- Auth -----

/**
 * Returned by POST /auth/login (no 2FA), POST /auth/register,
 * POST /auth/2fa/confirm-login, and the social-login endpoints.
 * The `cpf` field is null for users who haven't yet completed CPF
 * verification (LGPD-compliant gradual onboarding).
 */
export interface AuthResponse {
  user: Omit<User, 'cpf'> & { cpf: string | null };
  accessToken: string;
  refreshToken: string;
  cpfVerified: boolean;
}

/**
 * Returned by POST /auth/login when the account has 2FA enabled.
 * Caller exchanges `tempToken` + `code` at /auth/2fa/confirm-login
 * for a real AuthResponse.
 */
export interface TwoFactorChallengeResponse {
  twoFactorRequired: true;
  tempToken: string;
  methods: ReadonlyArray<'totp' | 'sms'>;
}

export type LoginResponse = AuthResponse | TwoFactorChallengeResponse;

/** Returned by POST /auth/refresh. */
export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/** Returned by GET /auth/csrf-token. */
export interface CsrfTokenResponse {
  csrfToken: string;
}

// ----- Listings -----

export type GetListingsResponse = PaginatedResponse<Listing>;

export interface GetListingResponse {
  listing: Listing & {
    seller: Pick<User, 'id' | 'name' | 'avatarUrl' | 'ratingAvg' | 'ratingCount'>;
    category: Category;
    brand?: Brand | null;
  };
}

export interface CreateListingResponse {
  listing: Listing;
}

// ----- Orders -----

export type GetOrdersResponse = PaginatedResponse<Order>;

export interface GetOrderResponse {
  order: Order & {
    listing: Listing;
    payments: Payment[];
  };
}

// ----- Payments -----

export interface CreatePixPaymentResponse {
  id: string;
  orderId: string;
  method: 'pix';
  amountBrl: number;
  qrCode: string;
  qrCodeBase64: string;
  pixCopiaECola: string;
  expiresAt: string;
  status: string;
}

export interface CreateCardPaymentResponse {
  id: string;
  orderId: string;
  method: 'card';
  installments: number;
  installmentAmount: number;
  total: number;
  status: string;
}

export interface CreateBoletoPaymentResponse {
  id: string;
  orderId: string;
  method: 'boleto';
  amountBrl: number;
  barcodeUrl: string;
  expiresAt: string;
  status: string;
}

export type CreatePaymentResponse =
  | CreatePixPaymentResponse
  | CreateCardPaymentResponse
  | CreateBoletoPaymentResponse;

// ----- Wallet -----

export interface GetWalletResponse {
  wallet: Wallet;
  transactions: WalletTransaction[];
}

// ----- Offers / Messages / Notifications / Reviews / Addresses -----

export type GetOffersResponse = PaginatedResponse<Offer>;
export type GetConversationsResponse = PaginatedResponse<Conversation>;
export type GetMessagesResponse = PaginatedResponse<Message>;
export type GetNotificationsResponse = PaginatedResponse<Notification>;
export type GetReviewsResponse = PaginatedResponse<Review>;
export type GetAddressesResponse = { addresses: Address[] };

// ----- Feature flags -----

export type GetFeatureFlagsResponse = FeatureFlag[];

// ----- Generic mutation acknowledgement -----

export interface OkResponse {
  ok: true;
}

export interface DeletedResponse {
  deleted: true;
}
