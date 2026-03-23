import { submitReview, getReviews } from '../reviews';
import { apiFetch } from '../api';

jest.mock('../api', () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('submitReview', () => {
  it('calls POST /reviews with orderId, rating, and comment', async () => {
    const review = { id: 'r1', orderId: 'o1', rating: 5, comment: 'Ótimo!' };
    mockApiFetch.mockResolvedValue(review);

    const result = await submitReview('o1', 5, 'Ótimo!');

    expect(mockApiFetch).toHaveBeenCalledWith('/reviews', {
      method: 'POST',
      body: JSON.stringify({ orderId: 'o1', rating: 5, comment: 'Ótimo!' }),
    });
    expect(result).toEqual(review);
  });

  it('sends undefined comment when not provided', async () => {
    mockApiFetch.mockResolvedValue({});

    await submitReview('o2', 3);

    expect(mockApiFetch).toHaveBeenCalledWith('/reviews', {
      method: 'POST',
      body: JSON.stringify({ orderId: 'o2', rating: 3, comment: undefined }),
    });
  });
});

describe('getReviews', () => {
  it('calls GET /reviews/:userId without page when not specified', async () => {
    const response = { items: [], total: 0, page: 1, totalPages: 0 };
    mockApiFetch.mockResolvedValue(response);

    const result = await getReviews('user-123');

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/reviews/user-123',
      { authenticated: false },
    );
    expect(result).toEqual(response);
  });

  it('calls GET /reviews/:userId?page=N when page specified', async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0, page: 2, totalPages: 3 });

    await getReviews('user-123', 2);

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/reviews/user-123?page=2',
      { authenticated: false },
    );
  });

  it('encodes userId with special characters', async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 0 });

    await getReviews('user/special');

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/reviews/user%2Fspecial',
      { authenticated: false },
    );
  });
});
