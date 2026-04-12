import { apiFetch } from './api';

export type DisputeReason =
  | 'NOT_RECEIVED'
  | 'NOT_AS_DESCRIBED'
  | 'DAMAGED'
  | 'COUNTERFEIT'
  | 'WRONG_ITEM';

export interface CreateDisputeData {
  orderId: string;
  reason: DisputeReason;
  description: string;
}

export interface Dispute {
  id: string;
  orderId: string;
  reason: DisputeReason;
  description: string;
  status: 'OPEN' | 'RESOLVED';
  resolution?: string;
  createdAt: string;
  order?: {
    id: string;
    listing?: {
      title: string;
      images?: { url: string }[];
    };
  };
  openedBy?: {
    id: string;
    name: string;
  };
}

export interface DisputesResponse {
  items: Dispute[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function createDispute(data: CreateDisputeData): Promise<Dispute> {
  return apiFetch<Dispute>('/disputes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getDisputes(page?: number): Promise<DisputesResponse> {
  const params = new URLSearchParams();
  if (page) params.append('page', String(page));
  const query = params.toString();
  return apiFetch<DisputesResponse>(`/disputes${query ? `?${query}` : ''}`);
}
