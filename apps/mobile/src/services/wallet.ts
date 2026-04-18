import { apiFetch } from './api';

export interface WalletBalance {
  availableBrl: number;
  pendingBrl: number;
  totalBrl: number;
}

export interface WalletTransaction {
  id: string;
  type: 'sale' | 'payout' | 'refund' | 'fee';
  amountBrl: number;
  description: string;
  status: 'completed' | 'pending' | 'failed';
  createdAt: string;
}

export interface TransactionsResponse {
  items: WalletTransaction[];
  total: number;
  page: number;
  totalPages: number;
}

export type PixKeyType = 'PIX_CPF' | 'PIX_CNPJ' | 'PIX_EMAIL' | 'PIX_PHONE' | 'PIX_RANDOM';

export interface PayoutMethodView {
  id: string;
  type: PixKeyType;
  pixKeyMasked: string;
  label: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface PayoutRequest {
  amountBrl: number;
  payoutMethodId: string;
}

export interface Payout {
  success: boolean;
  newBalance: number;
}

export async function getBalance(): Promise<WalletBalance> {
  return apiFetch<WalletBalance>('/wallet');
}

export async function getTransactions(page?: number): Promise<TransactionsResponse> {
  const query = page ? `?page=${page}` : '';
  return apiFetch<TransactionsResponse>(`/wallet/transactions${query}`);
}

export async function requestPayout(data: PayoutRequest): Promise<Payout> {
  return apiFetch<Payout>('/wallet/payout', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Saved PIX payout methods ────────────────────────────────────────

export async function listPayoutMethods(): Promise<PayoutMethodView[]> {
  return apiFetch<PayoutMethodView[]>('/wallet/payout-methods');
}

export async function createPayoutMethod(input: {
  type: PixKeyType;
  pixKey: string;
  label?: string;
  isDefault?: boolean;
}): Promise<PayoutMethodView> {
  return apiFetch<PayoutMethodView>('/wallet/payout-methods', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function setDefaultPayoutMethod(id: string): Promise<PayoutMethodView> {
  return apiFetch<PayoutMethodView>(`/wallet/payout-methods/${id}/default`, {
    method: 'PATCH',
  });
}

export async function deletePayoutMethod(id: string): Promise<{ success: true }> {
  return apiFetch<{ success: true }>(`/wallet/payout-methods/${id}`, {
    method: 'DELETE',
  });
}

// ── Payout request history (Wave 3C) ────────────────────────────────

export type PayoutRequestStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface PayoutRequestView {
  id: string;
  amountBrl: number;
  status: PayoutRequestStatus;
  snapshotType: PixKeyType;
  requestedAt: string;
  completedAt: string | null;
  failureReason: string | null;
}

export async function listMyPayouts(page = 1): Promise<{
  items: PayoutRequestView[];
  total: number;
  page: number;
  hasMore: boolean;
}> {
  const q = page > 1 ? `?page=${page}` : '';
  return apiFetch<{
    items: PayoutRequestView[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }>(`/wallet/payouts${q}`);
}
