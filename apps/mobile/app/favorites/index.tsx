import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { EmptyState } from '../../src/components/EmptyState';
import { ListingCard } from '../../src/components/ListingCard';
import { getFavorites, toggleFavorite } from '../../src/services/listings';

interface FavoriteListing {
  id: string;
  title: string;
  priceBrl: number;
  images: Array<{ url: string; position: number }>;
  condition: string;
  size: string;
  seller: { name: string; verified: boolean };
}

export default function FavoritesScreen() {
  const router = useRouter();
  const [listings, setListings] = useState<FavoriteListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchFavorites = useCallback(async (pageNum: number, isRefresh = false) => {
    try {
      const data = await getFavorites(pageNum);
      const items = data.items as unknown as FavoriteListing[];
      if (isRefresh || pageNum === 1) {
        setListings(items);
      } else {
        setListings((prev) => [...prev, ...items]);
      }
      setHasMore(pageNum < data.totalPages);
    } catch (_error) {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFavorites(1);
  }, [fetchFavorites]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    fetchFavorites(1, true);
  }, [fetchFavorites]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchFavorites(nextPage);
  }, [hasMore, loading, page, fetchFavorites]);

  const handleUnfavorite = useCallback(async (listingId: string) => {
    setListings((prev) => prev.filter((l) => l.id !== listingId));
    try {
      await toggleFavorite(listingId);
    } catch (_error) {
      fetchFavorites(1, true);
    }
  }, [fetchFavorites]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  if (listings.length === 0) {
    return (
      <EmptyState
        icon="heart-outline"
        title="Nenhum favorito ainda"
        subtitle="Explore os anúncios e salve seus itens favoritos"
        actionLabel="Explorar anúncios"
        onAction={() => router.push('/(tabs)/search')}
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={listings}
        renderItem={({ item }) => {
          const imageUrl = item.images?.sort((a, b) => a.position - b.position)[0]?.url;
          return (
            <View style={styles.cardWrapper}>
              <ListingCard
                id={item.id}
                title={item.title}
                priceBrl={item.priceBrl}
                imageUrl={imageUrl}
                condition={item.condition}
                size={item.size}
                sellerName={item.seller?.name ?? ''}
                sellerVerified={item.seller?.verified}
                favorited
                onToggleFavorite={() => handleUnfavorite(item.id)}
              />
            </View>
          );
        }}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary[500]} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: 12,
  },
  row: {
    justifyContent: 'space-between',
  },
  cardWrapper: {
    width: '48%',
    marginBottom: 12,
  },
});
