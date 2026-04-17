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

/**
 * Returned by POST /auth/login when the account has 2FA enabled. The client
 * must prompt for a code and then call POST /auth/2fa/confirm-login with
 * `tempToken` + the entered code to complete authentication.
 */
export interface TwoFaChallenge {
  requiresTwoFa: true;
  tempToken: string;
  method: 'TOTP' | 'SMS';
  phoneHint?: string;
}

export interface RegisterResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse | TwoFaChallenge> {
  const data = await apiFetch<LoginResponse | TwoFaChallenge>('/auth/login', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({ email, password }),
  });

  if ('requiresTwoFa' in data && data.requiresTwoFa) {
    // Do NOT persist tokens — caller must complete the 2FA challenge first.
    return data;
  }

  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

/**
 * Complete a 2FA challenge with the tempToken from login and the 6-digit code.
 * On success, persists the real access/refresh tokens and returns the user.
 */
export async function confirmLoginTwoFa(
  tempToken: string,
  token: string,
): Promise<AuthTokens> {
  const data = await apiFetch<AuthTokens>('/auth/2fa/confirm-login', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({ tempToken, token }),
  });
  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

/** Ask the API to resend the login-time SMS code (valid for 5 min). */
export async function resendLoginSms(
  tempToken: string,
): Promise<{ success: boolean; phoneHint: string }> {
  return apiFetch<{ success: boolean; phoneHint: string }>(
    '/auth/2fa/sms/login-resend',
    {
      method: 'POST',
      authenticated: false,
      body: JSON.stringify({ tempToken }),
    },
  );
}

/** Enrollment flow: start SMS 2FA for the authenticated user. */
export async function setupSms2Fa(
  phone: string,
): Promise<{ success: boolean; phoneHint: string }> {
  return apiFetch<{ success: boolean; phoneHint: string }>('/auth/2fa/sms/setup', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

/** Enrollment flow: confirm the enrollment code and flip SMS 2FA on. */
export async function enableSms2Fa(
  token: string,
): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/auth/2fa/sms/enable', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

/** Enrollment flow: resend the enrollment code (authenticated). */
export async function resendEnrollmentSms(): Promise<{
  success: boolean;
  phoneHint?: string;
  alreadyEnabled?: boolean;
}> {
  return apiFetch<{ success: boolean; phoneHint?: string; alreadyEnabled?: boolean }>(
    '/auth/2fa/sms/resend',
    { method: 'POST' },
  );
}

/** Current ToS version the app presents on the signup screen — must match
 *  the server's TOS_VERSION or login will immediately force re-acceptance. */
export const CURRENT_TOS_VERSION = '1.0.0';

export async function register(
  name: string,
  email: string,
  cpf: string,
  password: string,
  opts: { acceptedTos: boolean; tosVersion?: string } = { acceptedTos: true },
): Promise<RegisterResponse> {
  const data = await apiFetch<RegisterResponse>('/auth/register', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({
      name,
      email,
      cpf,
      password,
      acceptedTos: opts.acceptedTos,
      tosVersion: opts.tosVersion ?? CURRENT_TOS_VERSION,
    }),
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
  twoFaMethod: 'TOTP' | 'SMS';
  twoFaPhoneHint: string | null;
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

export async function requestEmailChange(
  newEmail: string,
  password: string,
): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/auth/request-email-change', {
    method: 'POST',
    body: JSON.stringify({ newEmail, password }),
  });
}

export async function confirmEmailChange(
  token: string,
): Promise<{ success: boolean; message: string; newEmail: string }> {
  return apiFetch<{ success: boolean; message: string; newEmail: string }>(
    '/auth/confirm-email-change',
    {
      method: 'POST',
      authenticated: false,
      body: JSON.stringify({ token }),
    },
  );
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
