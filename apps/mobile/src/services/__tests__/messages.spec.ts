import { getConversations, startConversation, getMessages, sendMessage } from '../messages';
import { apiFetch } from '../api';

jest.mock('../api', () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getConversations', () => {
  it('calls GET /messages/conversations without page param', async () => {
    const response = { items: [], total: 0, page: 1, totalPages: 0 };
    mockApiFetch.mockResolvedValue(response);

    const result = await getConversations();

    expect(mockApiFetch).toHaveBeenCalledWith('/messages/conversations');
    expect(result).toEqual(response);
  });

  it('appends page query param when specified', async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0, page: 3, totalPages: 5 });

    await getConversations(3);

    expect(mockApiFetch).toHaveBeenCalledWith('/messages/conversations?page=3');
  });
});

describe('startConversation', () => {
  it('calls POST /messages/conversations with otherUserId only', async () => {
    const conv = { id: 'c1' };
    mockApiFetch.mockResolvedValue(conv);

    const result = await startConversation('seller-1');

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith('/messages/conversations', {
      method: 'POST',
      body: JSON.stringify({ otherUserId: 'seller-1' }),
    });
    expect(result).toEqual(conv);
  });

  it('fires a follow-up sendMessage when an initial message is supplied', async () => {
    const conv = { id: 'c1' };
    // First call: conversation creation. Second: sendMessage on the new conv.
    mockApiFetch.mockResolvedValueOnce(conv);
    mockApiFetch.mockResolvedValueOnce({
      id: 'm1', conversationId: 'c1', senderId: 'u1', body: 'Olá',
    });

    await startConversation('seller-1', 'Olá, ainda disponível?');

    expect(mockApiFetch).toHaveBeenNthCalledWith(1, '/messages/conversations', {
      method: 'POST',
      body: JSON.stringify({ otherUserId: 'seller-1' }),
    });
    expect(mockApiFetch).toHaveBeenNthCalledWith(2,
      '/messages/conversations/c1/messages',
      {
        method: 'POST',
        body: JSON.stringify({ body: 'Olá, ainda disponível?' }),
      },
    );
  });

  it('returns the conversation even when the follow-up message send fails', async () => {
    const conv = { id: 'c1' };
    mockApiFetch.mockResolvedValueOnce(conv);
    mockApiFetch.mockRejectedValueOnce(new Error('network'));

    const result = await startConversation('seller-1', 'Primeiro contato');

    expect(result).toEqual(conv);
  });
});

describe('getMessages', () => {
  it('calls GET /messages/conversations/:id/messages without page', async () => {
    const response = { items: [], total: 0, page: 1, totalPages: 0 };
    mockApiFetch.mockResolvedValue(response);

    await getMessages('conv-1');

    expect(mockApiFetch).toHaveBeenCalledWith('/messages/conversations/conv-1/messages');
  });

  it('appends page query param when specified', async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0, page: 2, totalPages: 3 });

    await getMessages('conv-1', 2);

    expect(mockApiFetch).toHaveBeenCalledWith('/messages/conversations/conv-1/messages?page=2');
  });

  it('encodes conversationId', async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 0 });

    await getMessages('id/special');

    expect(mockApiFetch).toHaveBeenCalledWith('/messages/conversations/id%2Fspecial/messages');
  });
});

describe('sendMessage', () => {
  it('calls POST /messages/conversations/:id/messages with body', async () => {
    const msg = { id: 'm1', conversationId: 'c1', senderId: 'u1', body: 'Oi!' };
    mockApiFetch.mockResolvedValue(msg);

    const result = await sendMessage('c1', 'Oi!');

    expect(mockApiFetch).toHaveBeenCalledWith('/messages/conversations/c1/messages', {
      method: 'POST',
      body: JSON.stringify({ body: 'Oi!' }),
    });
    expect(result).toEqual(msg);
  });
});
