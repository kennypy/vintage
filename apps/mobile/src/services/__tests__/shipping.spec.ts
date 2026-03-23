import { calculateShipping } from '../shipping';
import { apiFetch } from '../api';

jest.mock('../api', () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('calculateShipping', () => {
  it('calls POST /shipping/rates with origin, destination, and weight', async () => {
    const response = {
      options: [
        { carrier: 'Correios', service: 'PAC', priceBrl: 15.9, estimatedDays: 7 },
        { carrier: 'Correios', service: 'SEDEX', priceBrl: 29.5, estimatedDays: 3 },
      ],
    };
    mockApiFetch.mockResolvedValue(response);

    const result = await calculateShipping('01234-567', '98765-432', 500);

    expect(mockApiFetch).toHaveBeenCalledWith('/shipping/rates', {
      method: 'POST',
      body: JSON.stringify({
        originCep: '01234-567',
        destinationCep: '98765-432',
        weightG: 500,
      }),
    });
    expect(result).toEqual(response);
  });
});
