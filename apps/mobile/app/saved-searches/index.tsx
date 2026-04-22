import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import {
  listSavedSearches,
  updateSavedSearch,
  deleteSavedSearch,
  type SavedSearch,
} from '../../src/services/savedSearches';

export default function SavedSearchesScreen() {
  const router = useRouter();
  const [items, setItems] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSavedSearches();
      setItems(res.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleNotify = async (item: SavedSearch) => {
    const next = !item.notify;
    setItems((prev) => prev.map((s) => (s.id === item.id ? { ...s, notify: next } : s)));
    try {
      await updateSavedSearch(item.id, next);
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar a busca.');
      setItems((prev) => prev.map((s) => (s.id === item.id ? { ...s, notify: item.notify } : s)));
    }
  };

  const remove = (item: SavedSearch) => {
    Alert.alert('Remover busca', `Deseja remover "${item.query}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          setItems((prev) => prev.filter((s) => s.id !== item.id));
          try {
            await deleteSavedSearch(item.id);
          } catch {
            Alert.alert('Erro', 'Não foi possível remover a busca.');
            refresh();
          }
        },
      },
    ]);
  };

  const runSearch = (item: SavedSearch) => {
    router.push({ pathname: '/(tabs)/search', params: { q: item.query } });
  };

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary[500]} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Buscas salvas</Text>
        <Text style={styles.subtitle}>
          Te avisamos quando novos anúncios baterem com essas buscas.
        </Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={40} color={colors.neutral[300]} />
          <Text style={styles.emptyText}>Nenhuma busca salva ainda.</Text>
          <Text style={styles.emptyHint}>
            Faça uma busca e toque em &ldquo;Salvar busca&rdquo; para começar.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <TouchableOpacity style={styles.rowMain} onPress={() => runSearch(item)}>
                <Ionicons name="search" size={16} color={colors.neutral[600]} />
                <Text style={styles.query} numberOfLines={1}>
                  {item.query}
                </Text>
              </TouchableOpacity>
              <View style={styles.rowActions}>
                <Switch
                  value={item.notify}
                  onValueChange={() => toggleNotify(item)}
                  trackColor={{ true: colors.primary[400] }}
                  thumbColor={item.notify ? colors.primary[600] : undefined}
                />
                <TouchableOpacity onPress={() => remove(item)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={18} color={colors.neutral[500]} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  header: { padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: colors.neutral[900] },
  subtitle: { color: colors.neutral[600], marginTop: 4 },
  empty: { alignItems: 'center', padding: 32, gap: 8 },
  emptyText: { fontSize: 15, color: colors.neutral[600], marginTop: 8 },
  emptyHint: { fontSize: 13, color: colors.neutral[500], textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.neutral[0],
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  query: { fontSize: 15, color: colors.neutral[900], flex: 1 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  deleteBtn: { padding: 4 },
});
