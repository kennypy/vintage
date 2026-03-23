import { apiGet, apiPost, apiPut, apiDelete, setAuthToken, clearAuthToken } from '../api';

const API_URL = 'http://localhost:3001/api/v1';

beforeEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
});

function mockFetch(body: unknown, status = 200) {
  const fn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  global.fetch = fn;
  return fn;
}

describe('apiGet', () => {
  it('sends GET request to the correct URL', async () => {
    const fetchMock = mockFetch({ data: 'test' });
    const result = await apiGet('/listings');
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/listings`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: undefined,
    });
    expect(result).toEqual({ data: 'test' });
  });

  it('includes auth token in headers when set', async () => {
    setAuthToken('my-token');
    const fetchMock = mockFetch({ data: 'test' });
    await apiGet('/listings');
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/listings`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer my-token',
      },
      body: undefined,
    });
  });

  it('throws on non-ok response', async () => {
    mockFetch({ message: 'Not found' }, 404);
    await expect(apiGet('/listings/999')).rejects.toThrow('API Error 404');
  });
});

describe('apiPost', () => {
  it('sends POST request with JSON body', async () => {
    const fetchMock = mockFetch({ id: '1' });
    const body = { title: 'Test', price: 100 };
    const result = await apiPost('/listings', body);
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(result).toEqual({ id: '1' });
  });
});

describe('apiPut', () => {
  it('sends PUT request with JSON body', async () => {
    const fetchMock = mockFetch({ updated: true });
    const body = { title: 'Updated' };
    const result = await apiPut('/listings/1', body);
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/listings/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(result).toEqual({ updated: true });
  });
});

describe('apiDelete', () => {
  it('sends DELETE request', async () => {
    const fetchMock = mockFetch({ deleted: true });
    const result = await apiDelete('/listings/1');
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/listings/1`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: undefined,
    });
    expect(result).toEqual({ deleted: true });
  });
});

describe('setAuthToken / clearAuthToken', () => {
  it('stores token in localStorage', () => {
    setAuthToken('abc123');
    expect(localStorage.getItem('vintage_token')).toBe('abc123');
  });

  it('removes token from localStorage', () => {
    setAuthToken('abc123');
    clearAuthToken();
    expect(localStorage.getItem('vintage_token')).toBeNull();
  });

  it('does not include auth header after clearing token', async () => {
    setAuthToken('abc123');
    clearAuthToken();
    const fetchMock = mockFetch({ data: 'test' });
    await apiGet('/listings');
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/listings`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: undefined,
    });
  });
});
