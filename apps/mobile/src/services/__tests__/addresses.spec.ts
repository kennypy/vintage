import { getAddresses, createAddress, deleteAddress } from '../addresses';
import { apiFetch } from '../api';

jest.mock('../api', () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getAddresses', () => {
  it('calls GET /users/me/addresses', async () => {
    const addresses = [{ id: 'a1', label: 'Casa', street: 'Rua A' }];
    mockApiFetch.mockResolvedValue(addresses);

    const result = await getAddresses();

    expect(mockApiFetch).toHaveBeenCalledWith('/users/me/addresses');
    expect(result).toEqual(addresses);
  });
});

describe('createAddress', () => {
  it('calls POST /users/me/addresses with address data', async () => {
    const data = {
      label: 'Casa',
      street: 'Rua das Flores',
      number: '123',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      cep: '01234-567',
    };
    const created = { id: 'a2', ...data, isDefault: false };
    mockApiFetch.mockResolvedValue(created);

    const result = await createAddress(data);

    expect(mockApiFetch).toHaveBeenCalledWith('/users/me/addresses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    expect(result).toEqual(created);
  });
});

describe('deleteAddress', () => {
  it('calls DELETE /users/me/addresses/:id', async () => {
    mockApiFetch.mockResolvedValue(undefined);

    await deleteAddress('a1');

    expect(mockApiFetch).toHaveBeenCalledWith('/users/me/addresses/a1', {
      method: 'DELETE',
    });
  });

  it('encodes addressId with special characters', async () => {
    mockApiFetch.mockResolvedValue(undefined);

    await deleteAddress('id/special');

    expect(mockApiFetch).toHaveBeenCalledWith('/users/me/addresses/id%2Fspecial', {
      method: 'DELETE',
    });
  });
});
