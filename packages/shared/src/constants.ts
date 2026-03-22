// ============================================================
// Vintage.br — Shared Constants
// ============================================================

// Buyer Protection Fee: R$3.50 fixed + 5% of item price
export const BUYER_PROTECTION_FIXED_BRL = 3.5;
export const BUYER_PROTECTION_RATE = 0.05;

// Offer constraints
export const MIN_OFFER_PERCENTAGE = 0.5; // Minimum 50% of asking price
export const OFFER_EXPIRY_HOURS = 48;

// Listing constraints
export const MAX_LISTING_IMAGES = 20;
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const LISTING_IMAGE_ASPECT_RATIO = 4 / 5; // Portrait mode

// Vacation mode
export const MAX_VACATION_DAYS = 90;

// Order lifecycle
export const SHIPPING_DEADLINE_DAYS = 5; // Seller must ship within 5 business days
export const DISPUTE_WINDOW_DAYS = 2; // Buyer has 2 days after delivery to dispute
export const AUTO_CONFIRM_DAYS = 2; // Auto-confirm if no dispute after 2 days

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
