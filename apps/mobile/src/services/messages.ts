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

/**
 * Open (or reuse) a 1:1 conversation with another user. The API
 * contract is `{ otherUserId }` — it keys conversations by the pair
 * of participant ids, not by listing, and the server dedupes on
 * Conversation.@@unique([participant1Id, participant2Id]). Mobile
 * used to post `{ listingId, message }`, which the controller body
 * type has never accepted: `body.otherUserId` was `undefined` every
 * time, the Prisma findUnique-by-participant-pair resolved to the
 * other side of a `{ undefined, user.id }` lookup, and the call
 * either 404'd or crashed deep inside MessagesService.
 *
 * `firstMessage` is an optional convenience — if supplied, we post
 * it onto the newly-created (or looked-up) conversation via the
 * normal sendMessage endpoint so listing detail's "Fazer oferta" /
 * "Enviar mensagem" CTAs remain a single service call from the UI
 * perspective. Failures on the follow-up send are swallowed: the
 * conversation row already exists, and the user can retry from the
 * thread screen without losing the shell.
 */
export async function startConversation(
  otherUserId: string,
  firstMessage?: string,
): Promise<Conversation> {
  const conv = await apiFetch<Conversation>('/messages/conversations', {
    method: 'POST',
    body: JSON.stringify({ otherUserId }),
  });
  if (firstMessage && firstMessage.trim().length > 0) {
    try {
      await sendMessage(conv.id, firstMessage);
    } catch {
      /* The conversation is already created; surface the thread and
       * let the user retry the send from the conversation screen. */
    }
  }
  return conv;
}

// Re-exported from ./offers so the mobile codebase has a single source
// of truth for offer status casing. Prisma emits UPPERCASE strings
// (see apps/api/prisma/schema.prisma → enum OfferStatus), and the
// shared package mirrors that. The `Message` type keeps optional
// offer fields so a future gateway change can surface offer state
// inline in chat without another type churn.
export type { OfferStatus } from './offers';
import type { OfferStatus } from './offers';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  imageUrl?: string | null;
  readAt: string | null;
  createdAt: string;
  // Offer fields (present only for offer-type messages)
  offerAmount?: number;
  offerStatus?: OfferStatus;
  offerListingId?: string;
}

export interface MessagesResponse {
  items: Message[];
  total: number;
  page: number;
  totalPages: number;
}

export async function getMessages(
  conversationId: string,
  page?: number,
): Promise<MessagesResponse> {
  const query = page ? `?page=${page}` : '';
  return apiFetch<MessagesResponse>(
    `/messages/conversations/${encodeURIComponent(conversationId)}/messages${query}`,
  );
}

export async function sendMessage(
  conversationId: string,
  body: string,
  imageUrl?: string,
): Promise<Message> {
  return apiFetch<Message>(
    `/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ body, imageUrl }),
    },
  );
}
