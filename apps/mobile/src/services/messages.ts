import { apiFetch } from './api';

export interface ConversationParticipant {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface Conversation {
  id: string;
  participant: ConversationParticipant;
  listingId: string;
  listingTitle: string;
  listingImageUrl?: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface ConversationsResponse {
  items: Conversation[];
  total: number;
  page: number;
  totalPages: number;
}

export async function getConversations(page?: number): Promise<ConversationsResponse> {
  const query = page ? `?page=${page}` : '';
  return apiFetch<ConversationsResponse>(`/messages/conversations${query}`);
}

export async function startConversation(
  listingId: string,
  message: string,
): Promise<Conversation> {
  return apiFetch<Conversation>('/messages/conversations', {
    method: 'POST',
    body: JSON.stringify({ listingId, message }),
  });
}
