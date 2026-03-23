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

export interface PayoutRequest {
  amountBrl: number;
  pixKey: string;
  pixKeyType: 'cpf' | 'email' | 'phone' | 'random';
}

export interface Payout {
  id: string;
  amountBrl: number;
  status: 'processing' | 'completed' | 'failed';
  createdAt: string;
}

export async function getBalance(): Promise<WalletBalance> {
  return apiFetch<WalletBalance>('/wallet/balance');
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
