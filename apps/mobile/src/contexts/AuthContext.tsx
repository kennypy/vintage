import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getToken, clearTokens } from '../services/api';
import { login as loginService, register as registerService, AuthUser } from '../services/auth';
import { getProfile, UserProfile } from '../services/users';

interface AuthContextType {
  user: (AuthUser & Partial<UserProfile>) | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, cpf: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<(AuthUser & Partial<UserProfile>) | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
    const response = await loginService(email, password);
    setUser(response.user);
  }, []);

  const signUp = useCallback(async (name: string, email: string, cpf: string, password: string) => {
    const response = await registerService(name, email, cpf, password);
    setUser(response.user);
  }, []);

  const signOut = useCallback(async () => {
    await clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        signIn,
        signUp,
        signOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
