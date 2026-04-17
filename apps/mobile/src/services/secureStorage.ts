/**
 * Safe wrapper around expo-secure-store.
 *
 * Problem: SecureStore is not available everywhere — on Web (Expo SDK 51+),
 * in some test runners, and occasionally when the native module fails to
 * link (e.g. mismatched expo-secure-store / Expo SDK versions), calls like
 * `SecureStore.deleteItemAsync` throw
 *   "ExpoSecureStore.default.deleteValueWithKeyAsync is not a function"
 * which crashes the AuthContext bootstrap and bricks the app.
 *
 * Strategy: try SecureStore first; on any failure fall back to a Map in
 * memory (best-effort — tokens won't persist across restarts, but the app
 * stays usable). In DEV we log once so the mismatch is visible.
 */
import * as SecureStore from 'expo-secure-store';

const mem = new Map<string, string>();
let _nativeOk: boolean | null = null;

function nativeLooksReady(): boolean {
  if (_nativeOk !== null) return _nativeOk;
  // SecureStore exposes these three functions when the native binding is
  // linked. Missing any of them means we should skip it.
  _nativeOk =
    typeof SecureStore.getItemAsync === 'function'
    && typeof SecureStore.setItemAsync === 'function'
    && typeof SecureStore.deleteItemAsync === 'function';
  if (!_nativeOk && __DEV__) {
    // eslint-disable-next-line no-console
    console.warn('[secureStorage] expo-secure-store unavailable — using in-memory fallback.');
  }
  return _nativeOk;
}

export async function secureGet(key: string): Promise<string | null> {
  if (nativeLooksReady()) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (err) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[secureStorage] getItemAsync failed, using memory:', String(err));
      }
      _nativeOk = false;
    }
  }
  return mem.get(key) ?? null;
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (nativeLooksReady()) {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch (err) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[secureStorage] setItemAsync failed, using memory:', String(err));
      }
      _nativeOk = false;
    }
  }
  mem.set(key, value);
}

export async function secureDelete(key: string): Promise<void> {
  if (nativeLooksReady()) {
    try {
      await SecureStore.deleteItemAsync(key);
      return;
    } catch (err) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[secureStorage] deleteItemAsync failed, using memory:', String(err));
      }
      _nativeOk = false;
    }
  }
  mem.delete(key);
}
