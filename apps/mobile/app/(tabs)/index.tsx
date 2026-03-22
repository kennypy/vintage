import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { colors } from '../../src/theme/colors';

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // TODO: Fetch feed listings
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>Vintage.br</Text>
      </View>
      <FlatList
        data={[]}
        renderItem={() => null}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Bem-vindo ao Vintage.br!</Text>
            <Text style={styles.emptyText}>
              Compre e venda moda de segunda mão.{'\n'}
              Sem taxas para vendedores.
            </Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.neutral[0],
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  logo: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary[600],
  },
  list: { flexGrow: 1 },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 120,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.neutral[900],
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: colors.neutral[500],
    textAlign: 'center',
    lineHeight: 24,
  },
});
