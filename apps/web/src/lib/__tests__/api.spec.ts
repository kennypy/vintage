import { apiGet, apiPost, apiPut, apiDelete, setAuthToken, clearAuthToken } from '../api';

const API_URL = 'http://localhost:3001/api/v1';

beforeEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
});

function mockFetch(body: unknown, status = 200) {
  // Both /auth/csrf-token (used by mutating methods) and the actual
  // request hit the same fetch mock; default both to OK so we can stay
  // generic here. Tests that need to assert the CSRF round-trip can
  // override this in-place.
  const fn = jest.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/auth/csrf-token')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ csrfToken: 'test-csrf-token' }),
        text: () => Promise.resolve('{"csrfToken":"test-csrf-token"}'),
      });
    }
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  });
  global.fetch = fn;
  return fn;
}

describe('apiGet', () => {
  it('sends GET request with credentials:include and no Authorization header', async () => {
    // Web client moved off localStorage tokens. Sessions live in HttpOnly
    // cookies; the browser sends them automatically because the fetch is
    // declared with credentials:'include'. Explicitly pin that we no
    // longer attach an Authorization header — adding one would re-open
    // the localStorage exfiltration path the migration closed.
    const fetchMock = mockFetch({ data: 'test' });
    const result = await apiGet('/listings');
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/listings`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: undefined,
    });
    expect(result).toEqual({ data: 'test' });
  });

  it('throws on non-ok response', async () => {
    mockFetch({ message: 'Not found' }, 404);
    await expect(apiGet('/listings/999')).rejects.toThrow('API Error 404');
  });
});

describe('apiPost', () => {
  it('sends POST with JSON body, CSRF token, and credentials:include', async () => {
    const fetchMock = mockFetch({ id: '1' });
    const body = { title: 'Test', price: 100 };
    const result = await apiPost('/listings', body);
    // The first call fetches the CSRF token; the second is the actual POST.
    const postCall = fetchMock.mock.calls.find(
      ([url]: [string]) => url === `${API_URL}/listings`,
    );
    expect(postCall).toBeDefined();
    expect(postCall[1]).toEqual({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'test-csrf-token',
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    expect(result).toEqual({ id: '1' });
  });
});

describe('apiPut', () => {
  it('sends PUT with JSON body and CSRF token', async () => {
    const fetchMock = mockFetch({ updated: true });
    const body = { title: 'Updated' };
    const result = await apiPut('/listings/1', body);
    const putCall = fetchMock.mock.calls.find(
      ([url]: [string]) => url === `${API_URL}/listings/1`,
    );
    expect(putCall).toBeDefined();
    expect(putCall[1].method).toBe('PUT');
    expect(putCall[1].headers['X-CSRF-Token']).toBe('test-csrf-token');
    expect(putCall[1].credentials).toBe('include');
    expect(result).toEqual({ updated: true });
  });
});

describe('apiDelete', () => {
  it('sends DELETE with CSRF and credentials', async () => {
    const fetchMock = mockFetch({ deleted: true });
    await apiDelete('/favorites/abc');
    const delCall = fetchMock.mock.calls.find(
      ([url]: [string]) => url === `${API_URL}/favorites/abc`,
    );
    expect(delCall).toBeDefined();
    expect(delCall[1].method).toBe('DELETE');
    expect(delCall[1].headers['X-CSRF-Token']).toBe('test-csrf-token');
    expect(delCall[1].credentials).toBe('include');
  });
});

describe('setAuthToken / clearAuthToken (legacy no-ops)', () => {
  it('setAuthToken writes a non-secret presence marker ("1"), never the raw token', () => {
    // Cookie migration: the JWT itself lives in an HttpOnly cookie set
    // by the API and is invisible to JS. Layouts across the app read
    // localStorage("vintage_token") to decide whether to render account
    // chrome, so we keep the key but store "1" (a marker) instead of
    // the credential. Leaking the marker is harmless.
    setAuthToken('pretend-this-is-a-jwt');
    expect(localStorage.getItem('vintage_token')).toBe('1');
  });

  it('clearAuthToken POSTs /auth/logout and scrubs localStorage', async () => {
    localStorage.setItem('vintage_token', 'leftover');
    const fetchMock = mockFetch({ success: true });
    await clearAuthToken();
    const logoutCall = fetchMock.mock.calls.find(
      ([url]: [string]) => typeof url === 'string' && url.endsWith('/auth/logout'),
    );
    expect(logoutCall).toBeDefined();
    expect(logoutCall[1].credentials).toBe('include');
    expect(localStorage.getItem('vintage_token')).toBeNull();
  });

  it('does not include auth header on subsequent requests', async () => {
    setAuthToken('abc123');
    const fetchMock = mockFetch({ data: 'test' });
    await apiGet('/listings');
    const getCall = fetchMock.mock.calls.find(
      ([url]: [string]) => url === `${API_URL}/listings`,
    );
    expect(getCall[1].headers).not.toHaveProperty('Authorization');
  });
});
