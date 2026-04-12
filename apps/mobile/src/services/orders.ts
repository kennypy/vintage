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

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'shipped'
  | 'delivered'
  | 'confirmed'
  | 'cancelled'
  | 'refunded';

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
