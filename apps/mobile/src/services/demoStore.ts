import * as SecureStore from 'expo-secure-store';
import type { Listing } from './listings';
import type { Conversation, Message } from './messages';

const DEMO_MODE_KEY = 'vintage_demo_mode';
const DEMO_USER_KEY = 'vintage_demo_user';

export const DEMO_PHOTOS = [
  'https://picsum.photos/seed/vint1/400/500',
  'https://picsum.photos/seed/vint2/400/500',
  'https://picsum.photos/seed/vint3/400/500',
  'https://picsum.photos/seed/vint4/400/500',
  'https://picsum.photos/seed/vint5/400/500',
  'https://picsum.photos/seed/vint6/400/500',
  'https://picsum.photos/seed/vint7/400/500',
  'https://picsum.photos/seed/vint8/400/500',
];

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  cpf: string;
  avatarUrl?: string;
  createdAt: string;
}

// In-memory listing store (persists only for app session)
const demoListingsMap = new Map<string, Listing>();

const SEEDED_LISTINGS: Listing[] = [
  {
    id: 'demo-1',
    title: 'Vestido Zara tamanho M',
    description:
      'Vestido preto fluido, usado 2 vezes, sem defeitos. Tecido leve, ideal para o verão. Excelente estado de conservação. Não tem manchas ou rasgos.',
    priceBrl: 89.9,
    condition: 'VERY_GOOD',
    size: 'M',
    color: 'Preto',
    brand: 'Zara',
    category: 'Moda Feminina',
    images: [
      { id: 'img1', url: DEMO_PHOTOS[0], order: 0 },
      { id: 'img2', url: DEMO_PHOTOS[1], order: 1 },
      { id: 'img3', url: DEMO_PHOTOS[2], order: 2 },
    ],
    seller: { id: 'demo-seller-1', name: 'Maria Silva', rating: 4.8 },
    isFavorited: false,
    viewCount: 42,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'demo-2',
    title: 'Tênis Nike Air Max 42',
    description:
      'Tênis Nike Air Max em ótimo estado. Usado poucas vezes, sem defeitos visíveis. Acompanha caixa original e cadarço reserva.',
    priceBrl: 199.9,
    condition: 'GOOD',
    size: '42',
    color: 'Branco/Preto',
    brand: 'Nike',
    category: 'Calçados',
    images: [
      { id: 'img4', url: DEMO_PHOTOS[3], order: 0 },
      { id: 'img5', url: DEMO_PHOTOS[4], order: 1 },
    ],
    seller: { id: 'demo-seller-2', name: 'João Pereira', rating: 4.5 },
    isFavorited: true,
    viewCount: 87,
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: 'demo-3',
    title: 'Bolsa Arezzo couro marrom',
    description:
      'Bolsa de couro legítimo da Arezzo, cor café. Comprada há 1 ano, usada poucas vezes. Excelente estado, sem arranhões.',
    priceBrl: 149.0,
    condition: 'NEW_WITHOUT_TAGS',
    size: 'Único',
    color: 'Marrom',
    brand: 'Arezzo',
    category: 'Bolsas',
    images: [
      { id: 'img6', url: DEMO_PHOTOS[5], order: 0 },
      { id: 'img7', url: DEMO_PHOTOS[0], order: 1 },
    ],
    seller: { id: 'demo-seller-3', name: 'Ana Lima', rating: 5.0 },
    isFavorited: false,
    viewCount: 31,
    createdAt: new Date(Date.now() - 259200000).toISOString(),
    updatedAt: new Date(Date.now() - 259200000).toISOString(),
  },
  {
    id: 'demo-4',
    title: 'Camisa Reserva slim fit G',
    description:
      'Camisa social slim fit da Reserva, cor azul claro. Tamanho G. Usada apenas uma vez em evento, sem manchas.',
    priceBrl: 59.9,
    condition: 'VERY_GOOD',
    size: 'G',
    color: 'Azul',
    brand: 'Reserva',
    category: 'Moda Masculina',
    images: [
      { id: 'img8', url: DEMO_PHOTOS[1], order: 0 },
      { id: 'img9', url: DEMO_PHOTOS[2], order: 1 },
    ],
    seller: { id: 'demo-seller-4', name: 'Pedro Rodrigues', rating: 4.7 },
    isFavorited: false,
    viewCount: 19,
    createdAt: new Date(Date.now() - 345600000).toISOString(),
    updatedAt: new Date(Date.now() - 345600000).toISOString(),
  },
  {
    id: 'demo-5',
    title: 'Óculos Ray-Ban Aviador',
    description:
      'Óculos Ray-Ban Aviador clássico dourado com lentes verdes. Produto novo com etiqueta e case original incluso.',
    priceBrl: 320.0,
    condition: 'NEW_WITH_TAGS',
    size: 'Único',
    color: 'Dourado',
    brand: 'Ray-Ban',
    category: 'Acessórios',
    images: [
      { id: 'img10', url: DEMO_PHOTOS[6], order: 0 },
      { id: 'img11', url: DEMO_PHOTOS[7], order: 1 },
      { id: 'img12', url: DEMO_PHOTOS[3], order: 2 },
    ],
    seller: { id: 'demo-seller-5', name: 'Carla Mendes', rating: 4.9 },
    isFavorited: false,
    viewCount: 156,
    createdAt: new Date(Date.now() - 432000000).toISOString(),
    updatedAt: new Date(Date.now() - 432000000).toISOString(),
  },
  {
    id: 'demo-6',
    title: 'Jaqueta Farm estampada P',
    description:
      'Jaqueta jeans estampada da Farm, tamanho P. Peça especial de coleção limitada. Usada com muito cuidado.',
    priceBrl: 129.9,
    condition: 'GOOD',
    size: 'P',
    color: 'Azul',
    brand: 'Farm',
    category: 'Moda Feminina',
    images: [
      { id: 'img13', url: DEMO_PHOTOS[4], order: 0 },
      { id: 'img14', url: DEMO_PHOTOS[5], order: 1 },
    ],
    seller: { id: 'demo-seller-6', name: 'Bia Ferreira', rating: 4.6 },
    isFavorited: false,
    viewCount: 28,
    createdAt: new Date(Date.now() - 518400000).toISOString(),
    updatedAt: new Date(Date.now() - 518400000).toISOString(),
  },
];

// Seed the in-memory map on module load
SEEDED_LISTINGS.forEach((l) => demoListingsMap.set(l.id, l));

// ─── Demo Mode Flags ─────────────────────────────────────────────────────────

export async function isDemoMode(): Promise<boolean> {
  const flag = await SecureStore.getItemAsync(DEMO_MODE_KEY);
  return flag === 'true';
}

export async function enableDemoMode(): Promise<void> {
  await SecureStore.setItemAsync(DEMO_MODE_KEY, 'true');
}

export async function disableDemoMode(): Promise<void> {
  await SecureStore.deleteItemAsync(DEMO_MODE_KEY);
  await SecureStore.deleteItemAsync(DEMO_USER_KEY);
}

// ─── Demo User ────────────────────────────────────────────────────────────────

export async function getDemoUser(): Promise<DemoUser | null> {
  const raw = await SecureStore.getItemAsync(DEMO_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DemoUser;
  } catch {
    return null;
  }
}

export async function createDemoUser(
  name: string,
  email: string,
  cpf: string,
): Promise<DemoUser> {
  const user: DemoUser = {
    id: `demo-user-${Date.now()}`,
    name,
    email,
    cpf,
    createdAt: new Date().toISOString(),
  };
  await SecureStore.setItemAsync(DEMO_USER_KEY, JSON.stringify(user));
  await enableDemoMode();
  return user;
}

// ─── Demo Listings ────────────────────────────────────────────────────────────

export function getDemoListings(): Listing[] {
  return Array.from(demoListingsMap.values());
}

export function getDemoListing(id: string): Listing | null {
  return demoListingsMap.get(id) ?? null;
}

export function addDemoListing(listing: Listing): void {
  demoListingsMap.set(listing.id, listing);
}

export function searchDemoListings(params: {
  search?: string;
  category?: string;
  condition?: string;
  size?: string;
}): Listing[] {
  let results = Array.from(demoListingsMap.values());
  if (params.search) {
    const q = params.search.toLowerCase();
    results = results.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        (l.brand ?? '').toLowerCase().includes(q),
    );
  }
  if (params.category) {
    results = results.filter((l) => l.category === params.category);
  }
  if (params.condition) {
    results = results.filter((l) => l.condition === params.condition);
  }
  if (params.size) {
    results = results.filter((l) => l.size === params.size);
  }
  return results;
}

// ─── Demo Conversations ───────────────────────────────────────────────────────

export const DEMO_CONVERSATIONS: Conversation[] = [
  {
    id: 'demo-conv-1',
    participant: { id: 'demo-seller-1', name: 'Maria Silva' },
    listingId: 'demo-1',
    listingTitle: 'Vestido Zara tamanho M',
    lastMessage: 'Ainda está disponível?',
    lastMessageAt: new Date(Date.now() - 3600000).toISOString(),
    unreadCount: 2,
  },
  {
    id: 'demo-conv-2',
    participant: { id: 'demo-seller-2', name: 'João Pereira' },
    listingId: 'demo-2',
    listingTitle: 'Tênis Nike Air Max 42',
    lastMessage: 'Posso fazer por R$ 180,00.',
    lastMessageAt: new Date(Date.now() - 86400000).toISOString(),
    unreadCount: 0,
  },
];

const DEMO_MESSAGES_MAP: Record<string, Message[]> = {
  'demo-conv-1': [
    {
      id: 'msg-3',
      conversationId: 'demo-conv-1',
      senderId: 'demo-seller-1',
      body: 'Ainda está disponível?',
      readAt: null,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'msg-2',
      conversationId: 'demo-conv-1',
      senderId: 'demo-seller-1',
      body: 'Olá! Adorei o vestido! Tem mais fotos?',
      readAt: null,
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: 'msg-1',
      conversationId: 'demo-conv-1',
      senderId: 'demo-user',
      body: 'Olá! Tenho interesse no "Vestido Zara tamanho M".',
      readAt: new Date(Date.now() - 10800000).toISOString(),
      createdAt: new Date(Date.now() - 10800000).toISOString(),
    },
  ],
  'demo-conv-2': [
    {
      id: 'msg-5',
      conversationId: 'demo-conv-2',
      senderId: 'demo-seller-2',
      body: 'Posso fazer por R$ 180,00.',
      readAt: new Date(Date.now() - 86000000).toISOString(),
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: 'msg-4',
      conversationId: 'demo-conv-2',
      senderId: 'demo-user',
      body: 'Tem como fazer uma oferta? Toparia R$ 170,00.',
      readAt: new Date(Date.now() - 172000000).toISOString(),
      createdAt: new Date(Date.now() - 172800000).toISOString(),
    },
  ],
};

// In-memory extra messages per conversation (for demo sending)
const demoExtraMessages = new Map<string, Message[]>();

export function getDemoMessages(conversationId: string): Message[] {
  const base = DEMO_MESSAGES_MAP[conversationId] ?? [];
  const extra = demoExtraMessages.get(conversationId) ?? [];
  return [...extra, ...base];
}

export function addDemoMessage(conversationId: string, message: Message): void {
  const existing = demoExtraMessages.get(conversationId) ?? [];
  demoExtraMessages.set(conversationId, [message, ...existing]);
  // Also update the conversation's last message in memory
  const conv = DEMO_CONVERSATIONS.find((c) => c.id === conversationId);
  if (conv) {
    conv.lastMessage = message.body;
    conv.lastMessageAt = message.createdAt;
  }
}
