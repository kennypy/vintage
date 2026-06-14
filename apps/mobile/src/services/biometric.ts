import * as LocalAuthentication from 'expo-local-authentication';
import { secureGet, secureSet, secureDelete } from './secureStorage';

// Key that gates the biometric-login offer. Written only after the
// user explicitly opts in on the login screen (never by default).
const BIOMETRIC_ENROLLED_KEY = 'biometric:enrolled';

// What we stash under expo-secure-store (iOS Keychain / Android Keystore):
// the REFRESH TOKEN, never the password. The refresh token is opaque,
// rotates on every use, and can be revoked server-side; the password is
// the master credential (reused across sites, grants password-change /
// account-deletion). Storing the password meant a keychain compromise
// handed over the whole account permanently; a refresh token can be
// revoked and is useless once rotated. On unlock we hand the refresh
// token to POST /auth/refresh to mint a fresh session — same transport
// the app already uses for silent re-auth.
const BIOMETRIC_REFRESH_KEY = 'biometric:refresh';
// Email is kept only as a non-secret display hint for the unlock screen
// ("Entrar como user@example.com"). It is NOT a credential.
const BIOMETRIC_EMAIL_KEY = 'biometric:email';

export interface BiometricCapability {
  available: boolean;
  enrolled: boolean; // device has at least one Face ID / Touch ID face/fingerprint enrolled
  types: LocalAuthentication.AuthenticationType[];
}

/**
 * Probe the device for biometric capability. Returns whether biometric
 * hardware exists AND the user has enrolled at least one face/finger.
 * Callers gate the opt-in UI on {available && enrolled}.
 */
export async function getBiometricCapability(): Promise<BiometricCapability> {
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    return { available: hasHardware, enrolled, types };
  } catch {
    return { available: false, enrolled: false, types: [] };
  }
}

/**
 * Has the user turned on biometric unlock for this app on this device?
 * (Distinct from the device capability check above.)
 */
export async function isBiometricEnrolled(): Promise<boolean> {
  return (await secureGet(BIOMETRIC_ENROLLED_KEY)) === 'true';
}

/**
 * Opt-in. Called from the login screen after a successful login when the
 * user taps "Ativar biometria". Stashes the REFRESH TOKEN (not the
 * password) in the secure enclave and marks the opt-in flag. We run a
 * quick biometric auth first so the gesture matches the intent.
 */
export async function enrollBiometric(email: string, refreshToken: string): Promise<boolean> {
  const ok = await prompt('Confirme para ativar desbloqueio por biometria');
  if (!ok) return false;
  await secureSet(BIOMETRIC_EMAIL_KEY, email);
  await secureSet(BIOMETRIC_REFRESH_KEY, refreshToken);
  await secureSet(BIOMETRIC_ENROLLED_KEY, 'true');
  return true;
}

/**
 * Refresh-token rotation hook. POST /auth/refresh rotates the refresh
 * token on every use (reuse-detecting rotation, server-side), so after a
 * silent refresh the stored token is stale and the NEXT biometric unlock
 * would fail. Call this whenever the app rotates tokens so the enclave
 * keeps the live refresh token. No-op when biometric isn't enrolled.
 */
export async function updateBiometricRefreshToken(refreshToken: string): Promise<void> {
  if (!(await isBiometricEnrolled())) return;
  await secureSet(BIOMETRIC_REFRESH_KEY, refreshToken);
}

/**
 * Opt-out. Called from settings. Clears the stored token and the
 * enrollment flag. Intentionally does NOT re-prompt — revoking biometric
 * should be as easy as enabling it.
 */
export async function unenrollBiometric(): Promise<void> {
  await Promise.all([
    secureDelete(BIOMETRIC_EMAIL_KEY),
    secureDelete(BIOMETRIC_REFRESH_KEY),
    secureDelete(BIOMETRIC_ENROLLED_KEY),
  ]);
}

/**
 * Read-back with biometric gate. Returns the stored refresh token (plus
 * the non-secret email hint) iff the user successfully authenticates;
 * null otherwise. The caller exchanges the refresh token at
 * POST /auth/refresh for a fresh access+refresh pair. Never returns the
 * token without the live biometric prompt passing.
 */
export async function unlockWithBiometric(): Promise<{ email: string; refreshToken: string } | null> {
  if (!(await isBiometricEnrolled())) return null;
  const ok = await prompt('Entrar com biometria');
  if (!ok) return null;
  const [email, refreshToken] = await Promise.all([
    secureGet(BIOMETRIC_EMAIL_KEY),
    secureGet(BIOMETRIC_REFRESH_KEY),
  ]);
  if (!email || !refreshToken) return null;
  return { email, refreshToken };
}

async function prompt(reason: string): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: 'Usar senha',
      disableDeviceFallback: false,
      cancelLabel: 'Cancelar',
    });
    return res.success;
  } catch {
    return false;
  }
}
