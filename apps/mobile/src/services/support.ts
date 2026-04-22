import { apiFetch } from './api';

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderRole: 'user' | 'agent';
  senderDisplayName?: string | null;
  body: string;
  attachmentUrls?: string[];
  createdAt: string;
}

export interface TicketSummary {
  id: string;
  subject: string;
  status: string;
  category: string;
  priority: string;
  createdAt: string;
}

export interface TicketDetail extends TicketSummary {
  body: string;
  resolvedAt: string | null;
  orderId: string | null;
  messages: TicketMessage[];
  user: { id: string; name: string; email: string };
  order: { id: string; status: string } | null;
}

export async function listMyTickets(
  page = 1,
  pageSize = 20,
): Promise<{ items: TicketSummary[]; total: number; page: number; totalPages: number }> {
  return apiFetch(`/support/tickets?page=${page}&pageSize=${pageSize}`);
}

export async function getTicket(id: string): Promise<TicketDetail> {
  return apiFetch<TicketDetail>(`/support/tickets/${encodeURIComponent(id)}`);
}

export async function replyToTicket(id: string, body: string): Promise<TicketMessage> {
  return apiFetch<TicketMessage>(`/support/tickets/${encodeURIComponent(id)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export async function createTicket(data: {
  subject: string;
  body: string;
  category?: string;
  priority?: string;
  orderId?: string;
}): Promise<TicketSummary> {
  return apiFetch<TicketSummary>('/support/tickets', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
