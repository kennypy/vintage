import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { secureGet, secureSet } from '../services/secureStorage';
import { toggleFavorite as toggleFavoriteApi, getFavorites } from '../services/listings';
import { isDemoMode, getDemoFavorites } from '../services/demoStore';
import { useAuth } from './AuthContext';

const FAVORITES_CACHE_KEY = 'vintage_fav_ids';

interface FavoritesContextType {
  favorites: Set<string>;
  isFavorited: (id: string) => boolean;
  toggleFavorite: (id: string) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextType | null>(null);

export function useFavorites(): FavoritesContextType {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const favRef = useRef<Set<string>>(new Set());
  const { isAuthenticated, user } = useAuth();

  // Keep ref in sync so toggleFavorite closure always has current value
  useEffect(() => {
    favRef.current = favorites;
    secureSet(FAVORITES_CACHE_KEY, JSON.stringify([...favorites])).catch(() => {});
  }, [favorites]);

  // Hydrate when auth state settles. Re-fetched on each user change so the
  // previous user's favorites never bleed into a freshly-logged-in account
  // on a shared device. Demo mode (offline / unauthenticated showcase) hits
  // the local seed store and bypasses the API entirely.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const demo = await isDemoMode();
        if (demo) {
          const items = getDemoFavorites();
          if (!cancelled) setFavorites(new Set(items.map((i) => i.id)));
          return;
        }
        // No authenticated user → show empty + cached state, do NOT call API.
        if (!isAuthenticated) {
          try {
            const cached = await secureGet(FAVORITES_CACHE_KEY);
            if (!cancelled && cached) {
              setFavorites(new Set(JSON.parse(cached) as string[]));
            } else if (!cancelled) {
              setFavorites(new Set());
            }
          } catch {
            if (!cancelled) setFavorites(new Set());
          }
          return;
        }
        const data = await getFavorites(1);
        const ids = (data.items as Array<{ id: string }>).map((i) => i.id);
        if (!cancelled) setFavorites(new Set(ids));
      } catch {
        // API failed (offline, 5xx) — fall back to last-known cache.
        try {
          const cached = await secureGet(FAVORITES_CACHE_KEY);
          if (!cancelled && cached) setFavorites(new Set(JSON.parse(cached) as string[]));
        } catch (_cacheError) {
          // Cache unavailable — leave whatever's already in state.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id]);

  const isFavorited = useCallback((id: string) => favorites.has(id), [favorites]);

  // Per-listing in-flight set: ignore further taps on the same heart while
  // its prior toggle is still resolving. Without this, a user double-tapping
  // a heart could race two toggle calls (the second sees the first's optimistic
  // state) and the rollback chain ends up incorrect on failure.
  const inFlight = useRef<Set<string>>(new Set());

  const toggleFavorite = useCallback(async (id: string) => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    const wasFaved = favRef.current.has(id);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      await toggleFavoriteApi(id);
    } catch {
      setFavorites((prev) => {
        const next = new Set(prev);
        if (wasFaved) next.add(id);
        else next.delete(id);
        return next;
      });
    } finally {
      inFlight.current.delete(id);
    }
  }, []);

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorited, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}
