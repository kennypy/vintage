import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ScrollView } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { ListingCard } from '../../src/components/ListingCard';

const CATEGORIES = [
  { id: '1', name: 'Moda Feminina', icon: '👗' },
  { id: '2', name: 'Moda Masculina', icon: '👔' },
  { id: '3', name: 'Calçados', icon: '👟' },
  { id: '4', name: 'Bolsas', icon: '👜' },
  { id: '5', name: 'Acessórios', icon: '💎' },
  { id: '6', name: 'Infantil', icon: '👶' },
  { id: '7', name: 'Casa', icon: '🏠' },
  { id: '8', name: 'Eletrônicos', icon: '📱' },
  { id: '9', name: 'Vintage', icon: '✨' },
];

const CONDITIONS = ['Novo com etiqueta', 'Novo', 'Muito bom', 'Bom', 'Satisfatório'];
const SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XG'];

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [results] = useState<any[]>([]);

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={colors.neutral[400]} />
          <TextInput
            style={styles.input}
            placeholder="Buscar roupas, marcas, estilos..."
            placeholderTextColor={colors.neutral[400]}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.neutral[400]} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterButton, showFilters && styles.filterActive]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons name="options-outline" size={20} color={showFilters ? colors.primary[600] : colors.neutral[600]} />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      {showFilters && (
        <View style={styles.filters}>
          <Text style={styles.filterLabel}>Condição</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {CONDITIONS.map((c) => (
              <TouchableOpacity key={c} style={styles.chip}>
                <Text style={styles.chipText}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.filterLabel}>Tamanho</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {SIZES.map((s) => (
              <TouchableOpacity key={s} style={styles.chip}>
                <Text style={styles.chipText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Categories or Results */}
      {query.length === 0 && results.length === 0 ? (
        <ScrollView style={styles.categoriesContainer} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Categorias</Text>
          <View style={styles.categoriesGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryCard, selectedCategory === cat.id && styles.categorySelected]}
                onPress={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
              >
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
                <Text style={styles.categoryName}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
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
              <Ionicons name="search-outline" size={48} color={colors.neutral[300]} />
              <Text style={styles.emptyText}>Nenhum resultado encontrado</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  searchRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, backgroundColor: colors.neutral[0] },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.neutral[100], paddingHorizontal: 12, borderRadius: 12, height: 44,
  },
  input: { flex: 1, marginLeft: 8, fontSize: 16, color: colors.neutral[900] },
  filterButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.neutral[100], justifyContent: 'center', alignItems: 'center' },
  filterActive: { backgroundColor: colors.primary[50] },
  filters: { backgroundColor: colors.neutral[0], paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.neutral[200] },
  filterLabel: { fontSize: 13, fontWeight: '600', color: colors.neutral[700], marginTop: 8, marginBottom: 6 },
  chipRow: { flexDirection: 'row' },
  chip: { backgroundColor: colors.neutral[100], paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginRight: 8 },
  chipText: { fontSize: 13, color: colors.neutral[700] },
  categoriesContainer: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: colors.neutral[900], marginBottom: 12 },
  categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryCard: {
    width: '31%', paddingVertical: 16, backgroundColor: colors.neutral[0],
    borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.neutral[200],
  },
  categorySelected: { borderColor: colors.primary[400], backgroundColor: colors.primary[50] },
  categoryIcon: { fontSize: 28, marginBottom: 6 },
  categoryName: { fontSize: 12, color: colors.neutral[700], textAlign: 'center' },
  list: { padding: 12 },
  row: { justifyContent: 'space-between' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 16, color: colors.neutral[400], marginTop: 12 },
});
