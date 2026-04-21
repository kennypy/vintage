// ============================================================
// Vintage.br — Shared Constants
// ============================================================

// Buyer Protection Fee: R$3.50 fixed + 5% of item price
export const BUYER_PROTECTION_FIXED_BRL = 3.5;
export const BUYER_PROTECTION_RATE = 0.05;

// Offer constraints
export const MIN_OFFER_PERCENTAGE = 0.5; // Minimum 50% of asking price
export const OFFER_EXPIRY_HOURS = 48;
// Counter-offer chain depth cap. 0 = original buyer offer; subsequent
// rounds alternate seller → buyer → seller. Cap prevents negotiation
// loops; after the cap the buyer must either buy at the last offered
// price or walk away.
export const MAX_OFFER_COUNTERS = 3;

// Payment retry
// Cap on attempts per order before auto-cancellation. Each create /
// retry mints a new Payment row with attemptNumber = prev + 1; when
// the cap is reached the next retry refuses and the order is cancelled.
export const MAX_PAYMENT_ATTEMPTS = 3;

// Listing constraints
export const MAX_LISTING_IMAGES = 20;
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const LISTING_IMAGE_ASPECT_RATIO = 4 / 5; // Portrait mode

// Vacation mode
export const MAX_VACATION_DAYS = 90;

// Order lifecycle
// Seller has SHIPPING_DEADLINE_DAYS business days after payment to
// dispatch. Transit itself doesn't consume any deadline — the dispute
// window opens only after delivery is confirmed (either by the buyer
// or by the TrackingPollerCron seeing a "delivered" carrier event).
export const SHIPPING_DEADLINE_DAYS = 5;
export const DISPUTE_WINDOW_DAYS = 5; // Buyer has 5 days after delivery to dispute
export const AUTO_CONFIRM_DAYS = 5; // Auto-confirm if no dispute after 5 days

// Escrow hold window — seller-protection buffer between the buyer
// confirming receipt (or auto-confirm firing) and funds landing in
// the seller's withdrawable balance. Buyer can open a dispute or
// request a return at any point during the hold. Env-overridable
// via ESCROW_HOLD_DAYS.
export const ESCROW_HOLD_DAYS = 2;

// Returns
// RETURN_WINDOW_DAYS: days after deliveredAt that a buyer may open a
// return request. RETURN_INSPECTION_DAYS: days after the returned
// package is marked RECEIVED before the seller is forced to either
// approve the refund or escalate to a dispute (auto-escalates on
// timeout so buyers don't sit in limbo).
export const RETURN_WINDOW_DAYS = 7;
export const RETURN_INSPECTION_DAYS = 3;

// Wallet
export const MIN_PAYOUT_BRL = 10.0;

// Promotions (BRL)
export const BUMP_PRICE_BRL = 4.9;
export const BUMP_DURATION_DAYS = 3;
export const SPOTLIGHT_PRICE_BRL = 29.9;
export const SPOTLIGHT_DURATION_DAYS = 7;
export const MEGAFONE_FREE_DAYS = 7; // Free boost for new listings

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Referral
export const REFERRAL_REWARD_BRL = 10.0;

// Brazilian states
export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export type BrazilianState = (typeof BRAZILIAN_STATES)[number];

// Brazilian clothing sizes
export const CLOTHING_SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG'] as const;

// Shoe sizes (BR)
export const SHOE_SIZES_BR = Array.from({ length: 19 }, (_, i) => (i + 33).toString());

// Item condition labels (Portuguese)
export const CONDITION_LABELS: Record<string, string> = {
  new_with_tags: 'Novo com etiqueta',
  new_without_tags: 'Novo sem etiqueta',
  very_good: 'Muito bom',
  good: 'Bom',
  satisfactory: 'Satisfatório',
};

// CEP regex
export const CEP_REGEX = /^\d{5}-?\d{3}$/;

// CPF regex (with or without formatting)
export const CPF_REGEX = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;

// CNPJ regex (with or without formatting)
export const CNPJ_REGEX = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;
