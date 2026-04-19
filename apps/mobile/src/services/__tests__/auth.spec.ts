import { login, register, logout, refreshToken } from '../auth';
import { apiFetch, setTokens, clearTokens } from '../api';

jest.mock('../api', () => ({
  apiFetch: jest.fn(),
  setTokens: jest.fn(),
  clearTokens: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockSetTokens = setTokens as jest.MockedFunction<typeof setTokens>;
const mockClearTokens = clearTokens as jest.MockedFunction<typeof clearTokens>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('login', () => {
  it('calls apiFetch with POST /auth/login unauthenticated and stores tokens', async () => {
    const response = {
      user: { id: '1', name: 'Ana', email: 'ana@test.com', cpf: '123', createdAt: '2024-01-01' },
      accessToken: 'at-123',
      refreshToken: 'rt-456',
    };
    mockApiFetch.mockResolvedValue(response);

    const result = await login('ana@test.com', 'pass123');

    expect(mockApiFetch).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      authenticated: false,
      // captchaToken is shipped as null while CAPTCHA_ENFORCE=false so the
      // wire shape stays stable across the rollout. Same pattern as
      // register / forgotPassword / resendLoginSms.
      body: JSON.stringify({
        email: 'ana@test.com',
        password: 'pass123',
        captchaToken: null,
      }),
    });
    expect(mockSetTokens).toHaveBeenCalledWith('at-123', 'rt-456');
    expect(result).toEqual(response);
  });
});

describe('register', () => {
  it('calls apiFetch with POST /auth/register unauthenticated and stores tokens', async () => {
    const response = {
      user: { id: '2', name: 'Pedro', email: 'pedro@test.com', cpf: '456', createdAt: '2024-01-01' },
      accessToken: 'at-789',
      refreshToken: 'rt-012',
    };
    mockApiFetch.mockResolvedValue(response);

    const result = await register('Pedro', 'pedro@test.com', '456', 'pass456');

    expect(mockApiFetch).toHaveBeenCalledWith('/auth/register', {
      method: 'POST',
      authenticated: false,
      body: JSON.stringify({
        name: 'Pedro',
        email: 'pedro@test.com',
        cpf: '456',
        password: 'pass456',
        acceptedTos: true,
        tosVersion: '1.0.0',
        captchaToken: null,
      }),
    });
    expect(mockSetTokens).toHaveBeenCalledWith('at-789', 'rt-012');
    expect(result).toEqual(response);
  });
});

describe('logout', () => {
  it('calls clearTokens', async () => {
    await logout();
    expect(mockClearTokens).toHaveBeenCalled();
  });
});

describe('refreshToken', () => {
  it('calls apiFetch with POST /auth/refresh and stores new tokens', async () => {
    const tokens = { accessToken: 'new-at', refreshToken: 'new-rt' };
    mockApiFetch.mockResolvedValue(tokens);

    const result = await refreshToken();

    expect(mockApiFetch).toHaveBeenCalledWith('/auth/refresh', { method: 'POST' });
    expect(mockSetTokens).toHaveBeenCalledWith('new-at', 'new-rt');
    expect(result).toEqual(tokens);
  });
});
