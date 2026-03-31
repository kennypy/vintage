import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useFavorites } from '../../src/contexts/FavoritesContext';
import { ListingCard } from '../../src/components/ListingCard';
import { getListings } from '../../src/services/listings';
import type { Listing } from '../../src/services/listings';
import { DEMO_PHOTOS, getDemoListings } from '../../src/services/demoStore';

const CARD_GAP = 12;

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
  };
}

export default function HomeScreen() {
  const { theme } = useTheme();
  const { isFavorited, toggleFavorite } = useFavorites();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<any[]>([]);

  const fetchListings = useCallback(async () => {
    try {
      const response = await getListings({ sortBy: 'newest', limit: 20 });
      setListings(response.items.map(mapListingToCard));
    } catch {
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
      setListings(demoItems.length > 0 ? demoItems : MOCK_LISTINGS);
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
      <FlatList
        data={listings}
        numColumns={2}
        keyExtractor={(item) => item.id}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <ListingCard
            {...item}
            favorited={isFavorited(item.id)}
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
});
