import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../AuthContext';
import { getToken, clearTokens } from '../../services/api';
import {
  login as loginService,
  logout as logoutService,
  register as registerService,
} from '../../services/auth';
import { getProfile } from '../../services/users';

jest.mock('../../services/api', () => ({
  apiFetch: jest.fn(),
  getToken: jest.fn(),
  clearTokens: jest.fn(),
}));

jest.mock('../../services/auth', () => ({
  login: jest.fn(),
  logout: jest.fn(),
  register: jest.fn(),
}));

jest.mock('../../services/users', () => ({
  getProfile: jest.fn(),
}));

const mockGetToken = getToken as jest.MockedFunction<typeof getToken>;
const mockClearTokens = clearTokens as jest.MockedFunction<typeof clearTokens>;
const mockLogin = loginService as jest.MockedFunction<typeof loginService>;
const mockLogout = logoutService as jest.MockedFunction<typeof logoutService>;
const mockRegister = registerService as jest.MockedFunction<typeof registerService>;
const mockGetProfile = getProfile as jest.MockedFunction<typeof getProfile>;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetToken.mockResolvedValue(null);
});

describe('useAuth', () => {
  it('throws when used outside AuthProvider', () => {
    // Suppress console.error for expected error
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');
    spy.mockRestore();
  });
});

describe('AuthProvider bootstrap', () => {
  it('sets user when token exists and profile loads', async () => {
    const profile = { id: '1', name: 'Ana', email: 'ana@test.com' };
    mockGetToken.mockResolvedValue('valid-token');
    mockGetProfile.mockResolvedValue(profile as never);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toEqual(profile);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('sets isLoading=false with user=null when no token', async () => {
    mockGetToken.mockResolvedValue(null);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('clears user gracefully when getProfile fails', async () => {
    mockGetToken.mockResolvedValue('expired-token');
    mockGetProfile.mockRejectedValue(new Error('401'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe('signIn', () => {
  it('calls loginService and sets user from response', async () => {
    const loginResponse = {
      user: { id: '1', name: 'Ana', email: 'ana@test.com', cpf: '123', createdAt: '2024-01-01' },
      accessToken: 'at',
      refreshToken: 'rt',
    };
    mockLogin.mockResolvedValue(loginResponse);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.signIn('ana@test.com', 'pass');
    });

    expect(mockLogin).toHaveBeenCalledWith('ana@test.com', 'pass');
    expect(result.current.user).toEqual(loginResponse.user);
    expect(result.current.isAuthenticated).toBe(true);
  });
});

describe('signUp', () => {
  it('calls registerService and sets user from response', async () => {
    const registerResponse = {
      user: { id: '2', name: 'Pedro', email: 'pedro@test.com', cpf: '456', createdAt: '2024-01-01' },
      accessToken: 'at',
      refreshToken: 'rt',
    };
    mockRegister.mockResolvedValue(registerResponse);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.signUp('Pedro', 'pedro@test.com', '456', 'pass');
    });

    expect(mockRegister).toHaveBeenCalledWith(
      'Pedro',
      'pedro@test.com',
      '456',
      'pass',
      expect.objectContaining({ acceptedTos: true, captchaToken: null }),
    );
    expect(result.current.user).toEqual(registerResponse.user);
  });
});

describe('signOut', () => {
  it('revokes the server-side session and clears local state', async () => {
    const loginResponse = {
      user: { id: '1', name: 'Ana', email: 'ana@test.com', cpf: '123', createdAt: '2024-01-01' },
      accessToken: 'at',
      refreshToken: 'rt',
    };
    mockLogin.mockResolvedValue(loginResponse);
    mockLogout.mockResolvedValue();

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Sign in first
    await act(async () => {
      await result.current.signIn('ana@test.com', 'pass');
    });
    expect(result.current.isAuthenticated).toBe(true);

    // Sign out
    await act(async () => {
      await result.current.signOut();
    });

    // For a real (non-demo) session the context MUST delegate to
    // logoutService so the server-side refresh token is revoked.
    // clearTokens is only called directly in the demo-mode branch.
    expect(mockLogout).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe('refreshUser', () => {
  it('fetches profile and updates user', async () => {
    const profile = { id: '1', name: 'Ana Updated', email: 'ana@test.com' };
    mockGetProfile.mockResolvedValue(profile as never);

    const loginResponse = {
      user: { id: '1', name: 'Ana', email: 'ana@test.com', cpf: '123', createdAt: '2024-01-01' },
      accessToken: 'at',
      refreshToken: 'rt',
    };
    mockLogin.mockResolvedValue(loginResponse);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.signIn('ana@test.com', 'pass');
    });

    await act(async () => {
      await result.current.refreshUser();
    });

    expect(mockGetProfile).toHaveBeenCalled();
    expect(result.current.user).toEqual(profile);
  });
});
