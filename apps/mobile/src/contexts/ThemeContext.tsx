import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { colors } from '../theme/colors';

const THEME_PREF_KEY = 'vintage_theme_pref';
const FULLSCREEN_PREF_KEY = 'vintage_fullscreen_pref';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface AppTheme {
  isDark: boolean;
  background: string;
  card: string;
  cardSecondary: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  header: string;
  inputBg: string;
  divider: string;
}

function buildTheme(isDark: boolean): AppTheme {
  return isDark
    ? {
        isDark: true,
        background: colors.neutral[950],
        card: colors.neutral[900],
        cardSecondary: colors.neutral[800],
        text: colors.neutral[50],
        textSecondary: colors.neutral[400],
        textTertiary: colors.neutral[500],
        border: colors.neutral[700],
        header: colors.neutral[900],
        inputBg: colors.neutral[800],
        divider: colors.neutral[700],
      }
    : {
        isDark: false,
        background: colors.neutral[50],
        card: colors.neutral[0],
        cardSecondary: colors.neutral[100],
        text: colors.neutral[900],
        textSecondary: colors.neutral[500],
        textTertiary: colors.neutral[400],
        border: colors.neutral[200],
        header: colors.neutral[0],
        inputBg: colors.neutral[50],
        divider: colors.neutral[200],
      };
}

interface ThemeContextType {
  theme: AppTheme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  fullScreen: boolean;
  setFullScreen: (value: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [fullScreen, setFullScreenState] = useState(false);

  // Load saved preferences
  useEffect(() => {
    SecureStore.getItemAsync(THEME_PREF_KEY)
      .then((val) => {
        if (val === 'light' || val === 'dark' || val === 'system') {
          setModeState(val);
        }
      })
      .catch(() => {});
    SecureStore.getItemAsync(FULLSCREEN_PREF_KEY)
      .then((val) => {
        if (val === 'true') setFullScreenState(true);
      })
      .catch(() => {});
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    SecureStore.setItemAsync(THEME_PREF_KEY, newMode).catch(() => {});
  }, []);

  const setFullScreen = useCallback((value: boolean) => {
    setFullScreenState(value);
    SecureStore.setItemAsync(FULLSCREEN_PREF_KEY, String(value)).catch(() => {});
  }, []);

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const theme = buildTheme(isDark);

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, fullScreen, setFullScreen }}>
      {children}
    </ThemeContext.Provider>
  );
}
