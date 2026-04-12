import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getToken, clearTokens } from '../services/api';
import { login as loginService, register as registerService, signInWithGoogle as signInWithGoogleService, signInWithApple as signInWithAppleService, AuthUser } from '../services/auth';
import { getProfile, UserProfile } from '../services/users';
import {
  getDemoUser,
  createDemoUser,
  updateDemoUser,
  disableDemoMode,
  DemoUser,
} from '../services/demoStore';
import {
  registerForPushNotifications,
  configureForegroundNotifications,
} from '../services/pushNotifications';

interface AuthContextType {
  user: (AuthUser & Partial<UserProfile>) | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isDemoMode: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, cpf: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signInWithApple: (identityToken: string, name?: string) => Promise<void>;
  signInDemo: (name?: string, email?: string, cpf?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUserAvatar: (avatarUrl: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function demoUserToAuthUser(u: DemoUser): AuthUser & Partial<UserProfile> {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    cpf: u.cpf,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt,
  };
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('network') || msg.includes('fetch') || msg.includes('connection');
  }
  return false;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<(AuthUser & Partial<UserProfile>) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [demoActive, setDemoActive] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await getProfile();
      setUser(profile as AuthUser & Partial<UserProfile>);
    } catch (_error) {
      // Do not sign out on refresh failure — keep the existing session.
      // Transient 401s (e.g., right after login while token propagates) should
      // not evict the user. The session will be invalidated naturally on the
      // next explicit API call that returns 401 via apiFetch's retry logic.
    }
  }, []);

  useEffect(() => {
    configureForegroundNotifications();

    async function bootstrap() {
      try {
        // Only restore real authenticated sessions (valid JWT token).
        // Demo mode sessions are NOT restored on app open — users must log in explicitly.
        // This ensures the auth gate always shows the login screen to unauthenticated users.
        const token = await getToken();
        if (token) {
          const profile = await getProfile();
          setUser(profile as AuthUser & Partial<UserProfile>);
          // Register push token on app launch for returning users
          registerForPushNotifications().catch(() => {});
        }
      } catch (_error) {
        setUser(null);
        await clearTokens();
      } finally {
        setIsLoading(false);
      }
    }
    bootstrap();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    // Always clear any stale demo session before attempting a real login.
    // This resets _demoModeCache to false so apiFetch doesn't bail out early.
    await disableDemoMode();
    await clearTokens();
    setDemoActive(false);
    try {
      const response = await loginService(email, password);
      setUser(response.user);
      registerForPushNotifications().catch(() => {});
    } catch (error) {
      console.error('[signIn] login failed, falling back to demo:', String(error));
      // Fall back to demo mode for any error (API unavailable, wrong credentials, etc.)
      // so users can always test the app regardless of server state
      const existing = await getDemoUser();
      if (existing && existing.email === email) {
        setUser(demoUserToAuthUser(existing));
        setDemoActive(true);
      } else {
        const demoUser = await createDemoUser(
          email.split('@')[0] ?? 'Usuário',
          email,
          '00000000000',
        );
        setUser(demoUserToAuthUser(demoUser));
        setDemoActive(true);
      }
    }
  }, []);

  const signUp = useCallback(async (name: string, email: string, cpf: string, password: string) => {
    try {
      const response = await registerService(name, email, cpf, password);
      setDemoActive(false);
      setUser(response.user);
      registerForPushNotifications().catch(() => {});
    } catch (error) {
      if (isNetworkError(error)) {
        // API unavailable — create local demo user with provided details
        const demoUser = await createDemoUser(name, email, cpf);
        setUser(demoUserToAuthUser(demoUser));
        setDemoActive(true);
      } else {
        throw error;
      }
    }
  }, []);

  const signInWithGoogle = useCallback(async (idToken: string) => {
    await disableDemoMode();
    await clearTokens();
    setDemoActive(false);
    const response = await signInWithGoogleService(idToken);
    setUser({ ...response.user, cpf: response.user.cpf ?? '' } as AuthUser & Partial<UserProfile>);
  }, []);

  const signInWithApple = useCallback(async (identityToken: string, name?: string) => {
    await disableDemoMode();
    await clearTokens();
    setDemoActive(false);
    const response = await signInWithAppleService(identityToken, name);
    setUser({ ...response.user, cpf: response.user.cpf ?? '' } as AuthUser & Partial<UserProfile>);
  }, []);

  const signInDemo = useCallback(async (
    name = 'Usuário Demo',
    email = 'demo@vintage.br',
    cpf = '00000000000',
  ) => {
    const demoUser = await createDemoUser(name, email, cpf);
    setUser(demoUserToAuthUser(demoUser));
    setDemoActive(true);
  }, []);

  const updateUserAvatar = useCallback(async (avatarUrl: string) => {
    setUser((prev) => (prev ? { ...prev, avatarUrl } : null));
    if (demoActive) {
      await updateDemoUser({ avatarUrl }).catch(() => {});
    }
  }, [demoActive]);

  const signOut = useCallback(async () => {
    await clearTokens();
    await disableDemoMode();
    setDemoActive(false);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isDemoMode: demoActive,
        signIn,
        signUp,
        signInWithGoogle,
        signInWithApple,
        signInDemo,
        signOut,
        refreshUser,
        updateUserAvatar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
