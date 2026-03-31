import { View, Text, StyleSheet, FlatList, RefreshControl, Dimensions, ActivityIndicator } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { ListingCard } from '../../src/components/ListingCard';
import { getListings, toggleFavorite as toggleFavoriteApi } from '../../src/services/listings';
import type { Listing } from '../../src/services/listings';
import { DEMO_PHOTOS, getDemoListings } from '../../src/services/demoStore';

const { width: _SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 12;

// Mock data as fallback (with photos for demo testing)
const MOCK_LISTINGS = [
  { id: 'demo-1', title: 'Vestido Zara tamanho M', priceBrl: 89.9, sellerName: 'Maria S.', sellerVerified: true, condition: 'VERY_GOOD', size: 'M', imageUrl: DEMO_PHOTOS[0] },
  { id: 'demo-2', title: 'Tênis Nike Air Max 42', priceBrl: 199.9, sellerName: 'João P.', condition: 'GOOD', size: '42', imageUrl: DEMO_PHOTOS[3] },
  { id: 'demo-3', title: 'Bolsa Arezzo couro marrom', priceBrl: 149.0, sellerName: 'Ana L.', sellerVerified: true, condition: 'NEW_WITHOUT_TAGS', imageUrl: DEMO_PHOTOS[5] },
  { id: 'demo-4', title: 'Camisa Reserva slim fit', priceBrl: 59.9, sellerName: 'Pedro R.', condition: 'VERY_GOOD', size: 'G', imageUrl: DEMO_PHOTOS[1] },
  { id: 'demo-5', title: 'Óculos Ray-Ban Aviador', priceBrl: 320.0, sellerName: 'Carla M.', sellerVerified: true, condition: 'NEW_WITH_TAGS', imageUrl: DEMO_PHOTOS[6] },
  { id: 'demo-6', title: 'Jaqueta Farm estampada', priceBrl: 129.9, sellerName: 'Bia F.', condition: 'GOOD', size: 'P', imageUrl: DEMO_PHOTOS[4] },
];

function mapListingToCard(listing: Listing) {
  return {
    id: listing.id,
    title: listing.title,
    priceBrl: listing.priceBrl,
    imageUrl: listing.images[0]?.url,
    sellerName: listing.seller.name,
    sellerVerified: false,
    condition: listing.condition,
    size: listing.size,
    favorited: listing.isFavorited,
  };
}

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const fetchListings = useCallback(async () => {
    try {
      const response = await getListings({ sortBy: 'newest', limit: 20 });
      const mapped = response.items.map(mapListingToCard);
      setListings(mapped);
      const favSet = new Set<string>();
      response.items.forEach((item) => {
        if (item.isFavorited) favSet.add(item.id);
      });
      setFavorites(favSet);
    } catch (_error) {
      // API unavailable — show demo listings (includes user-created ones)
      const demoItems = getDemoListings().map((l) => ({
        id: l.id,
        title: l.title,
        priceBrl: l.priceBrl,
        imageUrl: l.images[0]?.url,
        sellerName: l.seller.name,
        sellerVerified: false,
        condition: l.condition,
        size: l.size,
        favorited: l.isFavorited,
      }));
      setListings(demoItems.length > 0 ? demoItems : MOCK_LISTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh whenever the tab comes into focus (initial load + returning from sell screen)
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

  const toggleFavorite = async (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    try {
      await toggleFavoriteApi(id);
    } catch (_error) {
      // Revert on failure
      setFavorites((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>Vintage.br</Text>
        <Text style={styles.tagline}>Moda de segunda mão</Text>
      </View>
      <FlatList
        data={listings}
        numColumns={2}
        keyExtractor={(item) => item.id}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <ListingCard
            {...item}
            favorited={favorites.has(item.id)}
            onToggleFavorite={() => toggleFavorite(item.id)}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: colors.neutral[0],
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  logo: { fontSize: 24, fontWeight: '700', color: colors.primary[600] },
  tagline: { fontSize: 13, color: colors.neutral[400], marginTop: 2 },
  list: { padding: CARD_GAP },
  row: { justifyContent: 'space-between' },
});
