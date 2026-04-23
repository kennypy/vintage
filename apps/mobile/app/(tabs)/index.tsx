import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useFavorites } from '../../src/contexts/FavoritesContext';
import { ListingCard } from '../../src/components/ListingCard';
import { VerifyIdentityBanner } from '../../src/components/VerifyIdentityBanner';
import { getListings } from '../../src/services/listings';
import type { Listing } from '../../src/services/listings';
import { getDemoListings, isDemoModeSync } from '../../src/services/demoStore';

const CARD_GAP = 12;

function mapListingToCard(listing: Listing) {
  return {
    id: listing.id,
    title: listing.title,
    priceBrl: listing.priceBrl,
    imageUrl: listing.images[0]?.url,
    sellerName: listing.seller.name,
    // Prefer the Serpro-verified flag; falls back to false for legacy
    // API responses that don't yet carry the field.
    sellerVerified: listing.seller.cpfIdentityVerified ?? false,
    condition: listing.condition,
    size: listing.size,
  };
}

export default function HomeScreen() {
  const { theme } = useTheme();
  const { isFavorited, toggleFavorite } = useFavorites();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<any[]>([]);
  // Separates "feed load failed" from "feed is empty" so a network/auth
  // error can't hide behind fake "Maria S." mock listings. The previous
  // catch silently swapped real data for demo items — the user had no
  // way to see the API was down.
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    setFetchError(null);
    try {
      const response = await getListings({ sortBy: 'newest', limit: 20 });
      setListings(response.items.map(mapListingToCard));
    } catch (error) {
      // Intentional demo mode (user opted into a demo account) still
      // serves seeded items — that path is real product behaviour, not
      // an error hide. Only real users on a real account hit the error
      // branch below.
      if (isDemoModeSync()) {
        const demoItems = getDemoListings().map((l) => ({
          id: l.id,
          title: l.title,
          priceBrl: l.priceBrl,
          imageUrl: l.images[0]?.url,
          sellerName: l.seller.name,
          sellerVerified: false,
          condition: l.condition,
          size: l.size,
        }));
        setListings(demoItems);
      } else {
        setListings([]);
        setFetchError(
          error instanceof Error && error.message
            ? error.message
            : 'Não foi possível carregar os anúncios.',
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchListings();
    }, [fetchListings]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchListings();
    setRefreshing(false);
  }, [fetchListings]);

  const renderItem = useCallback(({ item }: { item: (typeof listings)[number] }) => (
    <ListingCard
      {...item}
      favorited={isFavorited(item.id)}
      onToggleFavorite={() => toggleFavorite(item.id)}
    />
  ), [isFavorited, toggleFavorite]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border, paddingTop: insets.top + 8 }]}>
        <Text style={[styles.logo, { color: colors.primary[600] }]}>Vintage.br</Text>
      </View>
      <VerifyIdentityBanner />
      {fetchError ? (
        <View style={[styles.errorBlock, { backgroundColor: theme.background }]}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.error[500]} />
          <Text style={[styles.errorTitle, { color: theme.text }]}>Não foi possível carregar o feed</Text>
          <Text style={[styles.errorBody, { color: theme.textSecondary }]}>{fetchError}</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.errorRetry}>
            <Text style={[styles.errorRetryText, { color: colors.primary[600] }]}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={listings}
          numColumns={2}
          keyExtractor={(item) => item.id}
          columnWrapperStyle={styles.row}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={11}
          initialNumToRender={8}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  logo: { fontSize: 24, fontWeight: '700' },
  list: { padding: CARD_GAP },
  row: { justifyContent: 'space-between' },
  errorBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  errorTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  errorBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorRetry: { paddingVertical: 8, paddingHorizontal: 16 },
  errorRetryText: { fontSize: 14, fontWeight: '600' },
});
