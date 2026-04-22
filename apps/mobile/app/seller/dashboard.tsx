import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { getSellerDashboard, type SellerDashboard } from '../../src/services/sellerInsights';

const formatBrl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Mobile parity with the existing web seller dashboard. Consumes
 * GET /seller-insights — surfaces overview tiles, per-listing
 * performance with sellability score, time-to-sell by category,
 * and the seller's top demand categories.
 */
export default function SellerDashboardScreen() {
  const [data, setData] = useState<SellerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getSellerDashboard());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!data) return <Text style={styles.empty}>Não foi possível carregar o painel.</Text>;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      }
    >
      <Text style={styles.title}>Painel da vendedora</Text>

      <View style={styles.tilesRow}>
        <Tile
          icon="cart"
          label="Vendas"
          value={String(data.overview.totalSales)}
        />
        <Tile
          icon="cash"
          label="Receita"
          value={`R$ ${formatBrl(data.overview.totalRevenueBrl)}`}
        />
      </View>
      <View style={styles.tilesRow}>
        <Tile
          icon="pricetag"
          label="Anúncios ativos"
          value={String(data.overview.activeListings)}
        />
        <Tile
          icon="star"
          label="Avaliação"
          value={`${data.overview.ratingAvg.toFixed(1)} (${data.overview.ratingCount})`}
        />
      </View>

      {data.overview.avgSalePriceBrl > 0 && (
        <View style={styles.tilesRow}>
          <Tile
            icon="trending-up"
            label="Preço médio"
            value={`R$ ${formatBrl(data.overview.avgSalePriceBrl)}`}
          />
        </View>
      )}

      {data.listingPerformance.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Seus anúncios</Text>
          {data.listingPerformance.slice(0, 20).map((l) => (
            <View key={l.id} style={styles.listingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listingTitle} numberOfLines={1}>
                  {l.title}
                </Text>
                <Text style={styles.listingMeta}>
                  R$ {formatBrl(l.priceBrl)} · 👁 {l.viewCount} · ❤ {l.favoriteCount}
                  {l.daysToSell != null ? ` · vendido em ${l.daysToSell}d` : ''}
                </Text>
              </View>
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreText}>{l.sellabilityScore}</Text>
              </View>
            </View>
          ))}
        </>
      )}

      {data.timeToSellByCategory.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Tempo médio de venda</Text>
          {data.timeToSellByCategory.slice(0, 8).map((c) => (
            <View key={c.categoryId} style={styles.bar}>
              <Text style={styles.barLabel}>{c.categoryName}</Text>
              <Text style={styles.barValue}>{c.avgDaysToSell} dias</Text>
            </View>
          ))}
        </>
      )}

      {data.topCategories.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Categorias em alta</Text>
          {data.topCategories.slice(0, 5).map((c) => (
            <View key={c.categoryId} style={styles.bar}>
              <Text style={styles.barLabel}>{c.categoryName}</Text>
              <Text style={styles.barValue}>{Math.round(c.demandScore)}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function Tile({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Ionicons name={icon} size={20} color={colors.primary[600]} />
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  title: { fontSize: 24, fontWeight: '700', color: colors.neutral[900], marginBottom: 16 },
  tilesRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tile: {
    flex: 1,
    backgroundColor: colors.neutral[0],
    padding: 14,
    borderRadius: 10,
    gap: 4,
  },
  tileValue: { fontSize: 18, fontWeight: '700', color: colors.neutral[900] },
  tileLabel: { fontSize: 12, color: colors.neutral[500] },
  sectionTitle: {
    fontSize: 16, fontWeight: '700',
    color: colors.neutral[800], marginTop: 24, marginBottom: 8,
  },
  listingRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.neutral[0],
    padding: 12, borderRadius: 10, marginBottom: 8,
  },
  listingTitle: { fontSize: 14, fontWeight: '600', color: colors.neutral[900] },
  listingMeta: { fontSize: 12, color: colors.neutral[500], marginTop: 2 },
  scoreBadge: {
    minWidth: 44, padding: 8, borderRadius: 8,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
  },
  scoreText: { color: '#fff', fontWeight: '700' },
  bar: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: colors.neutral[0],
    padding: 12, borderRadius: 8, marginBottom: 6,
  },
  barLabel: { color: colors.neutral[800] },
  barValue: { color: colors.primary[600], fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.neutral[500], marginTop: 40 },
});
