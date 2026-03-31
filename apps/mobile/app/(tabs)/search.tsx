import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ScrollView, ActivityIndicator,
} from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { ListingCard } from '../../src/components/ListingCard';
import { getListings } from '../../src/services/listings';
import { searchDemoListings } from '../../src/services/demoStore';
import type { Listing } from '../../src/services/listings';

const CATEGORIES = [
  { id: 'Moda Feminina', name: 'Moda Feminina', icon: '👗' },
  { id: 'Moda Masculina', name: 'Moda Masculina', icon: '👔' },
  { id: 'Calçados', name: 'Calçados', icon: '👟' },
  { id: 'Bolsas', name: 'Bolsas', icon: '👜' },
  { id: 'Acessórios', name: 'Acessórios', icon: '💎' },
  { id: 'Infantil', name: 'Infantil', icon: '👶' },
  { id: 'Casa', name: 'Casa', icon: '🏠' },
  { id: 'Eletrônicos', name: 'Eletrônicos', icon: '📱' },
  { id: 'Vintage', name: 'Vintage', icon: '✨' },
];

const CONDITIONS = [
  { value: 'NEW_WITH_TAGS', label: 'Novo com etiqueta' },
  { value: 'NEW_WITHOUT_TAGS', label: 'Novo' },
  { value: 'VERY_GOOD', label: 'Muito bom' },
  { value: 'GOOD', label: 'Bom' },
  { value: 'SATISFACTORY', label: 'Satisfatório' },
];
const SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XG'];

function mapListingToCard(listing: Listing) {
  return {
    id: listing.id,
    title: listing.title,
    priceBrl: listing.priceBrl,
    imageUrl: listing.images[0]?.url,
    sellerName: listing.seller.name,
    condition: listing.condition,
    size: listing.size,
  };
}

export default function SearchScreen() {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [results, setResults] = useState<ReturnType<typeof mapListingToCard>[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = useCallback(async (
    searchQuery: string,
    category?: string | null,
    condition?: string | null,
    size?: string | null,
  ) => {
    if (!searchQuery && !category && !condition && !size) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);
    try {
      const params: Record<string, string | undefined> = {
        search: searchQuery || undefined,
        category: category || undefined,
        condition: condition || undefined,
        size: size || undefined,
      };
      const response = await getListings(params);
      setResults(response.items.map(mapListingToCard));
    } catch (_error) {
      const demoResults = searchDemoListings({
        search: searchQuery || undefined,
        category: category || undefined,
        condition: condition || undefined,
        size: size || undefined,
      });
      setResults(demoResults.map(mapListingToCard));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      performSearch(query, selectedCategory, selectedCondition, selectedSize);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selectedCategory, selectedCondition, selectedSize, performSearch]);

  const handleCategorySelect = (catId: string) => {
    setSelectedCategory((prev) => (prev === catId ? null : catId));
  };

  const handleConditionSelect = (condValue: string) => {
    setSelectedCondition((prev) => (prev === condValue ? null : condValue));
  };

  const handleSizeSelect = (sizeValue: string) => {
    setSelectedSize((prev) => (prev === sizeValue ? null : sizeValue));
  };

  const clearAllFilters = () => {
    setSelectedCategory(null);
    setSelectedCondition(null);
    setSelectedSize(null);
    setQuery('');
  };

  const hasActiveFilters = !!(selectedCategory || selectedCondition || selectedSize);
  const isInSearchMode = hasSearched || query.length > 0 || hasActiveFilters;

  const activeConditionLabel = CONDITIONS.find((c) => c.value === selectedCondition)?.label;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Search Bar */}
      <View style={[styles.searchRow, { backgroundColor: theme.card }]}>
        <View style={[styles.searchBar, { backgroundColor: theme.inputBg }]}>
          <Ionicons name="search" size={20} color={theme.textTertiary} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            placeholder="Buscar roupas, marcas, estilos..."
            placeholderTextColor={theme.textTertiary}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={20} color={theme.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterButton, { backgroundColor: theme.inputBg }, showFilters && styles.filterActive]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={showFilters ? colors.primary[600] : theme.textSecondary}
          />
          {hasActiveFilters && <View style={styles.filterDot} />}
        </TouchableOpacity>
      </View>

      {/* Filter Panel */}
      {showFilters && (
        <View style={[styles.filters, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Condição</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {CONDITIONS.map((c) => (
              <TouchableOpacity
                key={c.value}
                style={[styles.chip, { backgroundColor: theme.inputBg }, selectedCondition === c.value && styles.chipSelected]}
                onPress={() => handleConditionSelect(c.value)}
              >
                <Text style={[styles.chipText, { color: theme.textSecondary }, selectedCondition === c.value && styles.chipTextSelected]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Tamanho</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {SIZES.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, { backgroundColor: theme.inputBg }, selectedSize === s && styles.chipSelected]}
                onPress={() => handleSizeSelect(s)}
              >
                <Text style={[styles.chipText, { color: theme.textSecondary }, selectedSize === s && styles.chipTextSelected]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Active Filters Bar */}
      {hasActiveFilters && (
        <View style={[styles.activeFiltersBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFiltersContent}>
            {selectedCategory && (
              <TouchableOpacity style={styles.activeChip} onPress={() => setSelectedCategory(null)}>
                <Text style={styles.activeChipText}>{selectedCategory}</Text>
                <Ionicons name="close" size={14} color={colors.primary[600]} style={styles.activeChipIcon} />
              </TouchableOpacity>
            )}
            {selectedCondition && (
              <TouchableOpacity style={styles.activeChip} onPress={() => setSelectedCondition(null)}>
                <Text style={styles.activeChipText}>{activeConditionLabel}</Text>
                <Ionicons name="close" size={14} color={colors.primary[600]} style={styles.activeChipIcon} />
              </TouchableOpacity>
            )}
            {selectedSize && (
              <TouchableOpacity style={styles.activeChip} onPress={() => setSelectedSize(null)}>
                <Text style={styles.activeChipText}>Tam. {selectedSize}</Text>
                <Ionicons name="close" size={14} color={colors.primary[600]} style={styles.activeChipIcon} />
              </TouchableOpacity>
            )}
          </ScrollView>
          <TouchableOpacity style={styles.clearAllButton} onPress={clearAllFilters}>
            <Text style={[styles.clearAllText, { color: theme.textSecondary }]}>Limpar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Categories Grid or Results */}
      {!isInSearchMode ? (
        <ScrollView style={styles.categoriesContainer} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Categorias</Text>
          <View style={styles.categoriesGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => handleCategorySelect(cat.id)}
              >
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
                <Text style={[styles.categoryName, { color: theme.textSecondary }]}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      ) : (
        <FlatList
          data={results}
          numColumns={2}
          keyExtractor={(item) => item.id}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => <ListingCard {...item} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={48} color={theme.textTertiary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Nenhum resultado encontrado</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8,
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, borderRadius: 12, height: 44,
  },
  input: { flex: 1, marginLeft: 8, fontSize: 16 },
  filterButton: {
    width: 44, height: 44, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  filterActive: { backgroundColor: colors.primary[50] + '80' },
  filterDot: {
    position: 'absolute', top: 8, right: 8,
    width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary[500],
  },
  filters: {
    paddingHorizontal: 12, paddingBottom: 12,
    borderBottomWidth: 1,
  },
  filterLabel: { fontSize: 13, fontWeight: '600', marginTop: 8, marginBottom: 6 },
  chipRow: { flexDirection: 'row' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, marginRight: 8,
  },
  chipSelected: { backgroundColor: colors.primary[50], borderWidth: 1, borderColor: colors.primary[400] },
  chipText: { fontSize: 13 },
  chipTextSelected: { color: colors.primary[600], fontWeight: '600' },
  activeFiltersBar: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, paddingLeft: 12, paddingVertical: 8,
  },
  activeFiltersContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.primary[50], borderWidth: 1, borderColor: colors.primary[300],
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, gap: 4,
  },
  activeChipText: { fontSize: 13, color: colors.primary[700], fontWeight: '500' },
  activeChipIcon: { marginLeft: 2 },
  clearAllButton: { paddingHorizontal: 12, paddingVertical: 8 },
  clearAllText: { fontSize: 13, fontWeight: '500' },
  categoriesContainer: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryCard: {
    width: '31%', paddingVertical: 16,
    borderRadius: 12, alignItems: 'center', borderWidth: 1,
  },
  categoryIcon: { fontSize: 28, marginBottom: 6 },
  categoryName: { fontSize: 12, textAlign: 'center' },
  list: { padding: 12 },
  row: { justifyContent: 'space-between' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 16, marginTop: 12 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
