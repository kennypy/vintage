import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import {
  listPriceAlerts,
  deletePriceAlert,
  type PriceAlert,
} from '../../src/services/priceAlerts';

const formatBrl = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PriceAlertsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPriceAlerts();
      setItems(res.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = (alert: PriceAlert) => {
    Alert.alert('Remover alerta', `Parar de monitorar "${alert.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          setItems((p) => p.filter((a) => a.id !== alert.id));
          try {
            await deletePriceAlert(alert.id);
          } catch {
            load();
          }
        },
      },
    ]);
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary[500]} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Alertas de preço</Text>
        <Text style={styles.subtitle}>
          Avisamos quando o preço dos favoritos cair.
        </Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="trending-down-outline" size={40} color={colors.neutral[300]} />
          <Text style={styles.emptyText}>Nenhum alerta ativo.</Text>
          <Text style={styles.emptyHint}>
            Favoritar um anúncio cria um alerta automaticamente.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/listing/${item.listingId}`)}
            >
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.img} />
              ) : (
                <View style={[styles.img, styles.imgPh]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={styles.priceRow}>
                  <Text style={styles.current}>{formatBrl(item.currentPriceBrl)}</Text>
                  {item.dropped && (
                    <>
                      <Text style={styles.original}>{formatBrl(item.originalPriceBrl)}</Text>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>-{item.dropPct}%</Text>
                      </View>
                    </>
                  )}
                </View>
              </View>
              <TouchableOpacity onPress={() => remove(item)} style={styles.deleteBtn}>
                <Ionicons name="close-circle-outline" size={22} color={colors.neutral[400]} />
              </TouchableOpacity>
            </TouchableOpacity>
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
    gap: 12,
    backgroundColor: colors.neutral[0],
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  img: { width: 56, height: 56, borderRadius: 8, backgroundColor: colors.neutral[200] },
  imgPh: {},
  itemTitle: { fontSize: 14, fontWeight: '600', color: colors.neutral[900] },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  current: { fontSize: 14, fontWeight: '700', color: colors.neutral[900] },
  original: {
    fontSize: 12,
    color: colors.neutral[500],
    textDecorationLine: 'line-through',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.primary[100],
  },
  badgeText: { fontSize: 11, color: colors.primary[700], fontWeight: '700' },
  deleteBtn: { padding: 4 },
});
