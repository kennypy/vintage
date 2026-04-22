import { apiFetch } from './api';

export interface OrderItem {
  id: string;
  listingId: string;
  title: string;
  priceBrl: number;
  imageUrl: string;
  size: string;
}

export interface OrderAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
}

export interface OrderShipping {
  carrier: string;
  trackingCode?: string;
  estimatedDelivery?: string;
  shippedAt?: string;
  deliveredAt?: string;
}

// Mirrors the Prisma enum OrderStatus in apps/api/prisma/schema.prisma —
// backend returns these as UPPERCASE strings. Previously this union used
// lowercase (`'paid'`, `'pending_payment'`, `'confirmed'`) which silently
// broke every status-conditional in the order screens.
export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'HELD'
  | 'COMPLETED'
  | 'DISPUTED'
  | 'REFUNDED'
  | 'CANCELLED';

export interface Order {
  id: string;
  status: OrderStatus;
  item: OrderItem;
  buyer: { id: string; name: string; avatarUrl?: string };
  seller: { id: string; name: string; avatarUrl?: string };
  totalBrl: number;
  shippingBrl: number;
  feeBrl: number;
  address: OrderAddress;
  shipping?: OrderShipping;
  escrowReleasesAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrdersResponse {
  items: Order[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CreateOrderData {
  listingId: string;
  addressId: string;
  paymentMethod: 'PIX' | 'CREDIT_CARD' | 'BOLETO';
  installments?: number;
  couponCode?: string;
}

export async function createOrder(data: CreateOrderData): Promise<Order> {
  return apiFetch<Order>('/orders', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getOrders(
  type: 'purchases' | 'sales',
  page?: number,
): Promise<OrdersResponse> {
  const role = type === 'purchases' ? 'buyer' : 'seller';
  const params = new URLSearchParams({ role });
  if (page) params.append('page', String(page));
  return apiFetch<OrdersResponse>(`/orders?${params.toString()}`);
}

export async function getOrder(id: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${encodeURIComponent(id)}`);
}

export async function markShipped(
  id: string,
  trackingCode: string,
  carrier: string,
): Promise<Order> {
  return apiFetch<Order>(`/orders/${encodeURIComponent(id)}/ship`, {
    method: 'PATCH',
    body: JSON.stringify({ trackingCode, carrier }),
  });
}

export async function confirmReceipt(id: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${encodeURIComponent(id)}/confirm`, {
    method: 'PATCH',
  });
}

export type RetryPaymentMethod = 'PIX' | 'CREDIT_CARD' | 'BOLETO';

export async function retryPayment(
  orderId: string,
  method: RetryPaymentMethod,
  installments?: number,
  cardToken?: string,
): Promise<unknown> {
  return apiFetch(`/payments/${encodeURIComponent(orderId)}/retry`, {
    method: 'POST',
    body: JSON.stringify({ method, installments, cardToken }),
  });
}

export async function cancelOrder(id: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${encodeURIComponent(id)}/cancel`, {
    method: 'PATCH',
  });
}
