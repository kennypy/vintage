import * as LocalAuthentication from 'expo-local-authentication';
import { secureGet, secureSet, secureDelete } from './secureStorage';

// Key that gates the biometric-login offer. Written only after the
// user explicitly opts in on the login screen (never by default).
const BIOMETRIC_ENROLLED_KEY = 'biometric:enrolled';

// Credentials stashed under expo-secure-store (iOS Keychain / Android
// Keystore). We stash email + password because the API requires them
// for the POST /auth/login call; the secure-store backing is encrypted
// at rest and only unlocked while the device is unlocked. Exfiltration
// requires physical device access AND device passcode, at which point
// the user's bigger problems have already landed.
const BIOMETRIC_EMAIL_KEY = 'biometric:email';
const BIOMETRIC_PASSWORD_KEY = 'biometric:password';

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
 * Opt-in. Called from the login screen after a successful password
 * login when the user taps "Ativar biometria". Stashes credentials
 * in the secure enclave and marks the opt-in flag. We run a quick
 * biometric auth first so the gesture matches the intent.
 */
export async function enrollBiometric(email: string, password: string): Promise<boolean> {
  const ok = await prompt('Confirme para ativar desbloqueio por biometria');
  if (!ok) return false;
  await secureSet(BIOMETRIC_EMAIL_KEY, email);
  await secureSet(BIOMETRIC_PASSWORD_KEY, password);
  await secureSet(BIOMETRIC_ENROLLED_KEY, 'true');
  return true;
}

/**
 * Opt-out. Called from settings. Clears the stored credentials and
 * the enrollment flag. Intentionally does NOT re-prompt — revoking
 * biometric should be as easy as enabling it.
 */
export async function unenrollBiometric(): Promise<void> {
  await Promise.all([
    secureDelete(BIOMETRIC_EMAIL_KEY),
    secureDelete(BIOMETRIC_PASSWORD_KEY),
    secureDelete(BIOMETRIC_ENROLLED_KEY),
  ]);
}

/**
 * Read-back with biometric gate. Returns the stored credentials iff
 * the user successfully authenticates; null otherwise. Never returns
 * credentials without the live biometric prompt passing.
 */
export async function unlockWithBiometric(): Promise<{ email: string; password: string } | null> {
  if (!(await isBiometricEnrolled())) return null;
  const ok = await prompt('Entrar com biometria');
  if (!ok) return null;
  const [email, password] = await Promise.all([
    secureGet(BIOMETRIC_EMAIL_KEY),
    secureGet(BIOMETRIC_PASSWORD_KEY),
  ]);
  if (!email || !password) return null;
  return { email, password };
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
