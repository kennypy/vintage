import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { secureGet, secureSet } from '../services/secureStorage';
import { toggleFavorite as toggleFavoriteApi, getFavorites } from '../services/listings';
import { isDemoMode, getDemoFavorites } from '../services/demoStore';

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

  // Keep ref in sync so toggleFavorite closure always has current value
  useEffect(() => {
    favRef.current = favorites;
    secureSet(FAVORITES_CACHE_KEY, JSON.stringify([...favorites])).catch(() => {});
  }, [favorites]);

  // Hydrate on mount
  useEffect(() => {
    (async () => {
      try {
        const demo = await isDemoMode();
        if (demo) {
          const items = getDemoFavorites();
          setFavorites(new Set(items.map((i) => i.id)));
          return;
        }
        const data = await getFavorites(1);
        const ids = (data.items as Array<{ id: string }>).map((i) => i.id);
        setFavorites(new Set(ids));
      } catch {
        // Fallback to local cache
        try {
          const cached = await secureGet(FAVORITES_CACHE_KEY);
          if (cached) setFavorites(new Set(JSON.parse(cached) as string[]));
        } catch (_cacheError) {
          // Cache unavailable — start with empty favorites
        }
      }
    })();
  }, []);

  const isFavorited = useCallback((id: string) => favorites.has(id), [favorites]);

  const toggleFavorite = useCallback(async (id: string) => {
    const wasFaved = favRef.current.has(id);
    // Optimistic update
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      await toggleFavoriteApi(id);
    } catch {
      // Revert on failure
      setFavorites((prev) => {
        const next = new Set(prev);
        if (wasFaved) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  }, []);

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorited, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}
