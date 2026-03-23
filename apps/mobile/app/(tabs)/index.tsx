import { View, Text, StyleSheet, FlatList, RefreshControl, Dimensions } from 'react-native';
import { useState, useCallback } from 'react';
import { colors } from '../../src/theme/colors';
import { ListingCard } from '../../src/components/ListingCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 12;

// Mock data until API integration
const MOCK_LISTINGS = [
  { id: '1', title: 'Vestido Zara tamanho M', priceBrl: 89.9, sellerName: 'Maria S.', sellerVerified: true, condition: 'VERY_GOOD', size: 'M' },
  { id: '2', title: 'Tênis Nike Air Max 42', priceBrl: 199.9, sellerName: 'João P.', condition: 'GOOD', size: '42' },
  { id: '3', title: 'Bolsa Arezzo couro marrom', priceBrl: 149.0, sellerName: 'Ana L.', sellerVerified: true, condition: 'NEW_WITHOUT_TAGS' },
  { id: '4', title: 'Camisa Reserva slim fit', priceBrl: 59.9, sellerName: 'Pedro R.', condition: 'VERY_GOOD', size: 'G' },
  { id: '5', title: 'Óculos Ray-Ban Aviador', priceBrl: 320.0, sellerName: 'Carla M.', sellerVerified: true, condition: 'NEW_WITH_TAGS' },
  { id: '6', title: 'Jaqueta Farm estampada', priceBrl: 129.9, sellerName: 'Bia F.', condition: 'GOOD', size: 'P' },
];

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // TODO: Fetch feed from API
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>Vintage.br</Text>
        <Text style={styles.tagline}>Moda de segunda mão</Text>
      </View>
      <FlatList
        data={MOCK_LISTINGS}
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
