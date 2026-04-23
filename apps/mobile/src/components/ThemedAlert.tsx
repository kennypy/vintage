import React, { useState, useCallback, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { colors } from '../theme/colors';

export type ThemedAlertButtonStyle = 'default' | 'cancel' | 'destructive';

export interface ThemedAlertButton {
  text?: string;
  style?: ThemedAlertButtonStyle;
  onPress?: () => void | Promise<void>;
}

export interface ThemedAlertOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
}

interface AlertState {
  title: string;
  message?: string;
  buttons: ThemedAlertButton[];
  options?: ThemedAlertOptions;
}

// Single mounted host + imperative show() so callers can keep the familiar
// Alert.alert(...) call shape without passing props through every screen.
// The app's custom dark theme doesn't reach the native Alert dialog, which
// is why the built-in Alert.alert always looks light.
let showInternal: ((state: AlertState) => void) | null = null;

export function showThemedAlert(
  title: string,
  message?: string,
  buttons?: ThemedAlertButton[],
  options?: ThemedAlertOptions,
) {
  const resolved: ThemedAlertButton[] =
    buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
  if (showInternal) {
    showInternal({ title, message, buttons: resolved, options });
  }
}

export function ThemedAlertHost() {
  const { theme } = useTheme();
  const [state, setState] = useState<AlertState | null>(null);

  const show = useCallback((next: AlertState) => setState(next), []);

  useEffect(() => {
    showInternal = show;
    return () => {
      if (showInternal === show) showInternal = null;
    };
  }, [show]);

  const close = useCallback(() => setState(null), []);

  const handlePress = useCallback(
    (btn: ThemedAlertButton) => {
      close();
      // Invoke after close so the modal animation doesn't race a
      // second showThemedAlert triggered from the handler itself.
      setTimeout(() => {
        try {
          const result = btn.onPress?.();
          if (result && typeof (result as Promise<unknown>).catch === 'function') {
            (result as Promise<unknown>).catch(() => {});
          }
        } catch {
          /* swallow - matches Alert.alert contract */
        }
      }, 0);
    },
    [close],
  );

  const handleDismiss = useCallback(() => {
    const onDismiss = state?.options?.onDismiss;
    close();
    if (onDismiss) {
      setTimeout(() => {
        try { onDismiss(); } catch { /* mirror Alert.alert contract */ }
      }, 0);
    }
  }, [close, state]);

  if (!state) return null;

  // `cancelable` defaults to true on Android for native Alert.alert. We treat
  // backdrop taps + hardware back as dismiss, unless the caller opted out.
  const cancelable = state.options?.cancelable !== false;

  const onOutside = () => {
    if (!cancelable) return;
    const cancelBtn = state.buttons.find((b) => b.style === 'cancel');
    if (cancelBtn) handlePress(cancelBtn);
    else handleDismiss();
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onOutside}
    >
      <Pressable style={styles.backdrop} onPress={onOutside}>
        <Pressable
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: theme.text }]}>{state.title}</Text>
          {state.message ? (
            <Text style={[styles.message, { color: theme.textSecondary }]}>{state.message}</Text>
          ) : null}
          <View style={styles.buttonRow}>
            {state.buttons.map((btn, idx) => {
              const destructive = btn.style === 'destructive';
              const cancel = btn.style === 'cancel';
              const btnColor = destructive
                ? colors.error[500]
                : cancel
                  ? theme.textSecondary
                  : colors.primary[600];
              return (
                <TouchableOpacity
                  key={`${btn.text ?? 'OK'}-${idx}`}
                  style={[
                    styles.button,
                    { borderTopColor: theme.border },
                    idx > 0 && {
                      borderLeftWidth: StyleSheet.hairlineWidth,
                      borderLeftColor: theme.border,
                    },
                  ]}
                  onPress={() => handlePress(btn)}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { color: btnColor },
                      cancel && { fontWeight: '500' },
                    ]}
                  >
                    {btn.text ?? 'OK'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 18,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

/**
 * Globally replace React Native's native Alert.alert with our themed
 * implementation. Called once at app startup from the root layout so every
 * existing `Alert.alert(...)` callsite (~45 files) inherits dark-mode
 * support without per-file edits. Alert.prompt (iOS-only) is left alone —
 * it requires a text input our modal doesn't render.
 */
export function installThemedAlertOverride() {
  // Require lazily so this module doesn't pin react-native's import order.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require('react-native');
  if (!RN?.Alert || (RN.Alert as { __themed?: boolean }).__themed) return;
  const themed = (
    title: string,
    message?: string,
    buttons?: ThemedAlertButton[],
    options?: ThemedAlertOptions,
  ) => showThemedAlert(title, message, buttons, options);
  (themed as unknown as { __themed: boolean }).__themed = true;
  RN.Alert.alert = themed;
}
