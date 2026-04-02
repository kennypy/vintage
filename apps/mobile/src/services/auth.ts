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

export async function signInWithApple(identityToken: string, name?: string): Promise<SocialLoginResponse> {
  const data = await apiFetch<SocialLoginResponse>('/auth/apple/callback', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({ identityToken, name }),
  });
  await setTokens(data.accessToken, data.refreshToken);
  return data;
}
