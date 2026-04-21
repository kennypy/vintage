import { Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { secureGet, secureSet } from './secureStorage';

const PRIMER_SHOWN_KEY = 'vintage_notif_primer_seen';

/**
 * Thin wrapper around the platform permission primitives that gives every
 * caller the same three-step UX:
 *
 *   1. Check the current OS status (fast, never prompts).
 *   2. If `undetermined`, request the permission — this is the only
 *      chance we get on iOS; after a denial the system suppresses the
 *      prompt forever.
 *   3. If `denied`, surface a Portuguese explanation with an "Abrir
 *      configurações" action that deep-links to the app's settings
 *      screen so the user can flip the toggle and come back.
 *
 * The helper returns `true` iff the permission is currently granted.
 * Callers pass a short `purpose` string used in the denied-state alert
 * so each screen explains why it needs the access ("para tirar fotos",
 * "para escolher da galeria", etc.) without the helper knowing anything
 * about the feature.
 *
 * Why centralise:
 *   - Every permission request before this file was an inline
 *     requestCameraPermissionsAsync() + alert('Permissão necessária')
 *     and no recovery path. A user who tapped "Don't Allow" once on
 *     iOS could never enable the feature without hunting through
 *     Settings themselves.
 *   - Android 13+ behaves subtly differently for notifications (runtime
 *     POST_NOTIFICATIONS gate) — keeping all of that in one place
 *     keeps call sites identical across OS versions.
 */

type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface PermissionOptions {
  /** Short "why" sentence shown in the denied-state alert. */
  purpose: string;
}

async function handleDenied(purpose: string, featureLabel: string): Promise<boolean> {
  // Two-button Alert: gives the user a path forward instead of a dead-
  // ended toast. `Linking.openSettings()` works on both iOS and Android
  // and drops the user on THIS app's settings page (not the global
  // settings root) — no need for the platform-specific `app-settings:`
  // URL scheme.
  return new Promise((resolve) => {
    Alert.alert(
      'Permissão necessária',
      `Precisamos de acesso ${purpose}. Abra as configurações do ${featureLabel} para permitir.`,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Abrir configurações',
          onPress: () => {
            Linking.openSettings().catch(() => {
              /* settings unavailable — nothing we can do except fail soft */
            });
            resolve(false);
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Ask for camera permission before launching the camera. Returns true if
 * granted. On denial, shows an alert with a link to OS settings.
 */
export async function ensureCameraPermission(opts: PermissionOptions): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  const status = normalise(current.status, current.canAskAgain);
  if (status === 'granted') return true;
  if (status === 'undetermined') {
    const requested = await ImagePicker.requestCameraPermissionsAsync();
    return requested.granted;
  }
  return handleDenied(opts.purpose, 'seu dispositivo');
}

/**
 * Ask for photo-library permission before picking from gallery. Returns
 * true if granted.
 */
export async function ensureMediaLibraryPermission(
  opts: PermissionOptions,
): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  const status = normalise(current.status, current.canAskAgain);
  if (status === 'granted') return true;
  if (status === 'undetermined') {
    const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return requested.granted;
  }
  return handleDenied(opts.purpose, 'seu dispositivo');
}

/**
 * Ask for notification permission. Separately from the other helpers,
 * this one is usually called behind a first-run primer screen that
 * explains WHY the app wants to notify — the primer is in
 * AuthContext.tsx. Here we just handle the system-level dance.
 *
 * Android 13+ adds a runtime POST_NOTIFICATIONS prompt that's triggered
 * by requestPermissionsAsync automatically in expo-notifications >= 0.27,
 * so no special path is needed. iOS provisional authorisation could be
 * added here if we ever decide to favour quiet delivery over prompts.
 */
export async function ensureNotificationPermission(
  opts: PermissionOptions,
): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain) {
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  }
  return handleDenied(opts.purpose, Platform.OS === 'ios' ? 'iOS' : 'Android');
}

/**
 * Read-only check for the system notification permission. Used by the
 * settings screen to surface "Desativado nas configurações do sistema"
 * state when the in-app toggle is on but the OS is blocking.
 */
export async function getNotificationPermissionStatus(): Promise<PermissionStatus> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  return current.canAskAgain ? 'undetermined' : 'denied';
}

/**
 * Opens the OS settings screen for this app. Exposed so UI components
 * can offer an "Abrir configurações" button without importing Linking
 * themselves.
 */
export function openOsSettings(): Promise<void> {
  return Linking.openSettings();
}

/**
 * First-run notification primer. Shows a custom Portuguese explanation
 * BEFORE the OS-level prompt, because iOS only gives us one chance to
 * ask and a cold "Allow Notifications?" with no context has miserable
 * grant rates. Persists a flag in secure storage so the primer runs at
 * most once per install.
 *
 * Returns true if permission was granted (either already, or after the
 * primer → OS prompt). Callers can use the return value to decide
 * whether to register a push token straight away.
 *
 * Call this shortly after a successful login — not at app boot, because
 * the user has more reason to say yes once they've done something
 * meaningful inside the app.
 */
export async function maybePrimeNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  // If the OS has already locked us out (user denied + canAskAgain
  // false), the primer can't help — don't waste a modal.
  if (!current.canAskAgain) return false;

  const alreadyShown = await secureGet(PRIMER_SHOWN_KEY);
  if (alreadyShown === 'true') return false;

  const userAccepted = await new Promise<boolean>((resolve) => {
    Alert.alert(
      'Ativar notificações?',
      'O Vintage.br usa notificações para te avisar de novas mensagens, ofertas aceitas, queda de preço em favoritos e atualizações de pedidos. Você pode desligar categorias específicas depois em Perfil → Notificações.',
      [
        { text: 'Agora não', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Ativar', onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });

  // Mark the primer as shown regardless of the choice — if the user
  // said "Agora não" they can still flip notifications on from the
  // settings screen later (the in-app toggle + OS settings deep-link
  // covers that recovery path).
  await secureSet(PRIMER_SHOWN_KEY, 'true');

  if (!userAccepted) return false;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** Collapse Expo's two-field status (`status` + `canAskAgain`) to our
 *  three-state enum. Expo reports status='denied' with canAskAgain=true
 *  on iOS for a fresh install where the prompt hasn't been shown yet —
 *  treat that as 'undetermined' so we prompt instead of deep-linking. */
function normalise(
  status: ImagePicker.PermissionStatus,
  canAskAgain: boolean,
): PermissionStatus {
  if (status === ImagePicker.PermissionStatus.GRANTED) return 'granted';
  if (status === ImagePicker.PermissionStatus.UNDETERMINED) return 'undetermined';
  return canAskAgain ? 'undetermined' : 'denied';
}
