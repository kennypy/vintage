import { apiFetch } from './api';

export type ReturnStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SHIPPED'
  | 'RECEIVED'
  | 'REFUNDED'
  | 'DISPUTED';

export type DisputeReason =
  | 'NOT_AS_DESCRIBED'
  | 'DAMAGED'
  | 'COUNTERFEIT'
  | 'NOT_RECEIVED'
  | 'WRONG_ITEM';

export interface Return {
  id: string;
  orderId: string;
  requestedById: string;
  status: ReturnStatus;
  reason: DisputeReason;
  description: string;
  returnTrackingCode: string | null;
  returnCarrier: string | null;
  returnLabelUrl: string | null;
  rejectionReason: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  inspectedAt: string | null;
  createdAt: string;
  order?: {
    id: string;
    totalBrl: number;
    listing: { title: string; images?: { url: string }[] };
    buyer: { id: string; name: string };
    seller: { id: string; name: string };
  };
}

export interface ReturnsPage {
  items: Return[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function createReturn(
  orderId: string,
  reason: DisputeReason,
  description: string,
): Promise<Return> {
  return apiFetch<Return>('/returns', {
    method: 'POST',
    body: JSON.stringify({ orderId, reason, description }),
  });
}

export async function listReturns(
  type: 'sent' | 'received' = 'sent',
  page = 1,
): Promise<ReturnsPage> {
  const params = new URLSearchParams({ type, page: String(page) });
  return apiFetch<ReturnsPage>(`/returns?${params.toString()}`);
}

export async function getReturn(id: string): Promise<Return> {
  return apiFetch<Return>(`/returns/${encodeURIComponent(id)}`);
}

export async function approveReturn(
  id: string,
  carrier?: string,
): Promise<Return> {
  return apiFetch<Return>(`/returns/${encodeURIComponent(id)}/approve`, {
    method: 'PATCH',
    body: JSON.stringify(carrier ? { carrier } : {}),
  });
}

export async function rejectReturn(id: string, reason: string): Promise<Return> {
  return apiFetch<Return>(`/returns/${encodeURIComponent(id)}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

export async function markReturnShipped(id: string): Promise<Return> {
  return apiFetch<Return>(`/returns/${encodeURIComponent(id)}/mark-shipped`, {
    method: 'PATCH',
  });
}

export async function inspectApprove(id: string, note?: string): Promise<Return> {
  return apiFetch<Return>(`/returns/${encodeURIComponent(id)}/inspect-approve`, {
    method: 'PATCH',
    body: JSON.stringify(note ? { note } : {}),
  });
}

export async function inspectReject(id: string, reason: string): Promise<Return> {
  return apiFetch<Return>(`/returns/${encodeURIComponent(id)}/inspect-reject`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}
