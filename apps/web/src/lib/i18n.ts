// Shared Portuguese (BR) localization helpers for the web app.
// Centralises currency formatting and enum → label mapping so every
// screen renders consistent pt-BR copy.

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * Format a numeric amount as BRL, e.g. 1234.56 → "R$ 1.234,56".
 */
export function formatBRL(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return BRL_FORMATTER.format(0);
  }
  return BRL_FORMATTER.format(amount);
}

/**
 * Normalize a CEP string to the Brazilian format NNNNN-NNN.
 * Strips non-digits and inserts the dash when there are 8 digits.
 */
export function formatCEP(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/**
 * Order status labels (pt-BR). API values remain English enums; only rendering changes.
 */
export const ORDER_STATUS_PT: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  DISPUTED: 'Em disputa',
  REFUNDED: 'Estornado',
};

/**
 * Tailwind background/text color classes per order status.
 */
export const ORDER_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PAID: 'bg-blue-100 text-blue-800',
  SHIPPED: 'bg-purple-100 text-purple-800',
  DELIVERED: 'bg-green-100 text-green-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
  DISPUTED: 'bg-orange-100 text-orange-800',
  REFUNDED: 'bg-gray-100 text-gray-700',
};

/**
 * Listing status labels (pt-BR).
 */
export const LISTING_STATUS_PT: Record<string, string> = {
  ACTIVE: 'Ativo',
  PAUSED: 'Pausado',
  SOLD: 'Vendido',
  DRAFT: 'Rascunho',
  REMOVED: 'Removido',
  EXPIRED: 'Expirado',
};

export const LISTING_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  PAUSED: 'bg-yellow-100 text-yellow-800',
  SOLD: 'bg-blue-100 text-blue-800',
  DRAFT: 'bg-gray-100 text-gray-600',
  REMOVED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-gray-100 text-gray-600',
};

/**
 * Offer status labels (pt-BR).
 */
export const OFFER_STATUS_PT: Record<string, string> = {
  PENDING: 'Pendente',
  ACCEPTED: 'Aceita',
  REJECTED: 'Recusada',
  COUNTERED: 'Contraproposta',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
};

export const OFFER_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  ACCEPTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  COUNTERED: 'bg-blue-100 text-blue-800',
  EXPIRED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

/**
 * Dispute reason labels (pt-BR).
 */
export const DISPUTE_REASON_PT: Record<string, string> = {
  NOT_RECEIVED: 'Item não recebido',
  NOT_AS_DESCRIBED: 'Item diferente do anúncio',
  DAMAGED: 'Item danificado',
  WRONG_ITEM: 'Item errado',
  COUNTERFEIT: 'Produto falsificado',
};

export function translateOrderStatus(status: string): string {
  return ORDER_STATUS_PT[status] ?? status;
}

export function translateListingStatus(status: string): string {
  return LISTING_STATUS_PT[status] ?? status;
}

export function translateOfferStatus(status: string): string {
  return OFFER_STATUS_PT[status] ?? status;
}
