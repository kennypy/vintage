import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getToken, clearTokens } from '../services/api';
import { login as loginService, register as registerService, AuthUser } from '../services/auth';
import { getProfile, UserProfile } from '../services/users';
import {
  isDemoMode,
  getDemoUser,
  createDemoUser,
  updateDemoUser,
  disableDemoMode,
  DemoUser,
} from '../services/demoStore';

interface AuthContextType {
  user: (AuthUser & Partial<UserProfile>) | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isDemoMode: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, cpf: string, password: string) => Promise<void>;
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
      setUser(null);
      await clearTokens();
    }
  }, []);

  useEffect(() => {
    async function bootstrap() {
      try {
        // Check demo mode first
        const demo = await isDemoMode();
        if (demo) {
          const demoUser = await getDemoUser();
          if (demoUser) {
            setUser(demoUserToAuthUser(demoUser));
            setDemoActive(true);
            setIsLoading(false);
            return;
          }
        }

        const token = await getToken();
        if (token) {
          const profile = await getProfile();
          setUser(profile as AuthUser & Partial<UserProfile>);
        }
      } catch (_error) {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }
    bootstrap();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const response = await loginService(email, password);
      setDemoActive(false);
      setUser(response.user);
    } catch (error) {
      if (isNetworkError(error)) {
        // API unavailable — check for existing demo user with matching email
        const existing = await getDemoUser();
        if (existing && existing.email === email) {
          setUser(demoUserToAuthUser(existing));
          setDemoActive(true);
        } else {
          // Create a minimal demo user for this email
          const demoUser = await createDemoUser(
            email.split('@')[0] ?? 'Usuário',
            email,
            '00000000000',
          );
          setUser(demoUserToAuthUser(demoUser));
          setDemoActive(true);
        }
      } else {
        throw error;
      }
    }
  }, []);

  const signUp = useCallback(async (name: string, email: string, cpf: string, password: string) => {
    try {
      const response = await registerService(name, email, cpf, password);
      setDemoActive(false);
      setUser(response.user);
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
