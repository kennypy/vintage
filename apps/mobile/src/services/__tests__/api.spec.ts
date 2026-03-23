import * as SecureStore from 'expo-secure-store';
import { apiFetch, getToken, setTokens, clearTokens, ApiError } from '../api';

jest.mock('expo-secure-store');

const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

// Mock global fetch
const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('token helpers', () => {
  it('setTokens stores both access and refresh tokens', async () => {
    await setTokens('access-123', 'refresh-456');
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('vintage_access_token', 'access-123');
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('vintage_refresh_token', 'refresh-456');
  });

  it('getToken reads access token from SecureStore', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue('my-token');
    const token = await getToken();
    expect(token).toBe('my-token');
    expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('vintage_access_token');
  });

  it('clearTokens deletes both tokens', async () => {
    await clearTokens();
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('vintage_access_token');
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('vintage_refresh_token');
  });
});

describe('apiFetch', () => {
  const mockJsonResponse = (data: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(data),
  });

  it('adds Authorization header when authenticated and token exists', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue('my-token');
    mockFetch.mockResolvedValue(mockJsonResponse({ success: true }));

    await apiFetch('/test');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-token',
        }),
      }),
    );
  });

  it('omits Authorization header when authenticated=false', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ data: 1 }));

    await apiFetch('/test', { authenticated: false });

    const callHeaders = mockFetch.mock.calls[0][1].headers;
    expect(callHeaders).not.toHaveProperty('Authorization');
  });

  it('parses JSON response on success', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(null);
    mockFetch.mockResolvedValue(mockJsonResponse({ items: [1, 2] }));

    const result = await apiFetch('/items');
    expect(result).toEqual({ items: [1, 2] });
  });

  it('throws ApiError with status and message on non-ok response', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(null);
    mockFetch.mockResolvedValue(mockJsonResponse({ message: 'Not found' }, 404));

    await expect(apiFetch('/missing')).rejects.toThrow(ApiError);
    try {
      await apiFetch('/missing');
    } catch (e) {
      expect((e as ApiError).status).toBe(404);
      expect((e as ApiError).message).toBe('Not found');
    }
  });

  it('attempts token refresh on 401 and retries request', async () => {
    mockSecureStore.getItemAsync
      .mockResolvedValueOnce('expired-token') // initial getToken
      .mockResolvedValueOnce('refresh-token-val') // attemptRefresh reads refresh token
      .mockResolvedValueOnce('new-access-token'); // retry getToken

    // First call returns 401, refresh succeeds, retry succeeds
    mockFetch
      .mockResolvedValueOnce(mockJsonResponse({}, 401)) // original request 401
      .mockResolvedValueOnce(mockJsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh' })) // refresh call
      .mockResolvedValueOnce(mockJsonResponse({ data: 'refreshed' })); // retry

    const result = await apiFetch('/protected');
    expect(result).toEqual({ data: 'refreshed' });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws "Session expired" when refresh fails on 401', async () => {
    mockSecureStore.getItemAsync
      .mockResolvedValueOnce('expired-token') // initial getToken
      .mockResolvedValueOnce(null); // no refresh token

    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, 401));

    await expect(apiFetch('/protected')).rejects.toThrow('Session expired');
  });

  it('falls back to "Erro de conexão" when response body is not JSON', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(null);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn().mockRejectedValue(new Error('invalid json')),
    });

    await expect(apiFetch('/broken')).rejects.toThrow('Erro de conexão');
  });
});

describe('ApiError', () => {
  it('has correct name, status, and message', () => {
    const err = new ApiError(403, 'Forbidden');
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(403);
    expect(err.message).toBe('Forbidden');
    expect(err).toBeInstanceOf(Error);
  });
});
