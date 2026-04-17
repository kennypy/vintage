import { apiFetch, setTokens, clearTokens } from './api';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  cpf: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface RegisterResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({ email, password }),
  });

  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function register(
  name: string,
  email: string,
  cpf: string,
  password: string,
): Promise<RegisterResponse> {
  const data = await apiFetch<RegisterResponse>('/auth/register', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({ name, email, cpf, password }),
  });

  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function logout(): Promise<void> {
  await clearTokens();
}

export async function refreshToken(): Promise<AuthTokens> {
  const data = await apiFetch<AuthTokens>('/auth/refresh', {
    method: 'POST',
  });

  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

export interface SocialLoginResponse {
  user: Omit<AuthUser, 'cpf'> & { cpf: string | null };
  accessToken: string;
  refreshToken: string;
  cpfVerified: boolean;
}

export async function signInWithGoogle(idToken: string): Promise<SocialLoginResponse> {
  const data = await apiFetch<SocialLoginResponse>('/auth/google/token', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({ idToken }),
  });
  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

export interface SecurityStatus {
  cpfVerified: boolean;
  twoFaEnabled: boolean;
  isContaProtegida: boolean;
  recentLogins: Array<{ platform: string | null; success: boolean; createdAt: string }>;
}

export async function getSecurityStatus(): Promise<SecurityStatus> {
  return apiFetch<SecurityStatus>('/auth/security-status');
}

export interface TwoFaSetup {
  secret: string;
  qrCodeDataUrl: string;
  otpAuthUrl: string;
}

export async function setupTwoFa(): Promise<TwoFaSetup> {
  return apiFetch<TwoFaSetup>('/auth/2fa/setup', { method: 'POST' });
}

export async function enableTwoFa(token: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/auth/2fa/enable', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function disableTwoFa(token: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/auth/2fa/disable', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/auth/forgot-password', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/auth/reset-password', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function signInWithApple(identityToken: string, name?: string): Promise<SocialLoginResponse> {
  const data = await apiFetch<SocialLoginResponse>('/auth/apple/callback', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({ identityToken, name }),
  });
  await setTokens(data.accessToken, data.refreshToken);
  return data;
}
