import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { listMyBundles, type Bundle } from '../../src/services/bundles';

const formatBrl = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_LABELS: Record<Bundle['status'], string> = {
  OPEN: 'Aberto',
  CHECKED_OUT: 'Finalizado',
  EXPIRED: 'Expirado',
};

export default function BundlesScreen() {
  const router = useRouter();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMyBundles();
      setBundles(res);
    } catch {
      setBundles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary[500]} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Meus pacotes</Text>
        <Text style={styles.subtitle}>
          Agrupe itens do mesmo vendedor e economize no frete.
        </Text>
      </View>

      {bundles.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cube-outline" size={40} color={colors.neutral[300]} />
          <Text style={styles.emptyText}>Você ainda não tem pacotes.</Text>
          <Text style={styles.emptyHint}>
            Na página do vendedor, selecione dois ou mais itens para criar um pacote.
          </Text>
        </View>
      ) : (
        <FlatList
          data={bundles}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => {
            const total = item.items.reduce((s, it) => s + Number(it.listing.priceBrl), 0);
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/bundles/${item.id}`)}
              >
                <View style={styles.imagesRow}>
                  {item.items.slice(0, 4).map((it) => {
                    const url = it.listing.images[0]?.url;
                    return url ? (
                      <Image key={it.id} source={{ uri: url }} style={styles.itemImg} />
                    ) : (
                      <View key={it.id} style={[styles.itemImg, styles.imgPh]} />
                    );
                  })}
                  {item.items.length > 4 && (
                    <View style={[styles.itemImg, styles.more]}>
                      <Text style={styles.moreText}>+{item.items.length - 4}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>
                    {item.items.length} {item.items.length === 1 ? 'item' : 'itens'}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {formatBrl(total)} · {STATUS_LABELS[item.status]}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />
              </TouchableOpacity>
            );
          }}
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.neutral[0],
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  imagesRow: { flexDirection: 'row', gap: 2 },
  itemImg: { width: 40, height: 40, borderRadius: 6, backgroundColor: colors.neutral[200] },
  imgPh: {},
  more: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.neutral[200] },
  moreText: { fontSize: 11, color: colors.neutral[600], fontWeight: '700' },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.neutral[900] },
  cardMeta: { fontSize: 12, color: colors.neutral[500], marginTop: 2 },
});
