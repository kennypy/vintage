import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { listReturns, type Return } from '../../src/services/returns';

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Solicitada',
  APPROVED: 'Aprovada',
  REJECTED: 'Recusada',
  SHIPPED: 'Enviada',
  RECEIVED: 'Recebida',
  REFUNDED: 'Reembolsada',
  DISPUTED: 'Em disputa',
};

export default function ReturnsListScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'sent' | 'received'>('sent');
  const [items, setItems] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listReturns(tab)
      .then((resp) => setItems(resp.items))
      .finally(() => setLoading(false));
  }, [tab]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Devoluções</Text>
      <View style={styles.tabs}>
        {(['sent', 'received'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={tab === t ? styles.tabTextActive : styles.tabText}>
              {t === 'sent' ? 'Minhas solicitações' : 'Recebidas (vendedor)'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>Nenhuma devolução ainda.</Text>
      ) : (
        <ScrollView>
          {items.map((ret) => (
            <TouchableOpacity
              key={ret.id}
              style={styles.card}
              onPress={() => router.push(`/returns/${ret.id}`)}
            >
              <Text style={styles.cardTitle}>
                {ret.order?.listing.title ?? 'Pedido'}
              </Text>
              <Text style={styles.cardStatus}>{STATUS_LABELS[ret.status] ?? ret.status}</Text>
              <Text style={styles.cardMeta}>
                Solicitada em {new Date(ret.createdAt).toLocaleDateString('pt-BR')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.neutral[50] },
  title: { fontSize: 24, fontWeight: '700', color: colors.neutral[900], marginBottom: 16 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: colors.neutral[100], alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary[500] },
  tabText: { color: colors.neutral[800] },
  tabTextActive: { color: '#fff', fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.neutral[500], marginTop: 40 },
  card: { padding: 16, backgroundColor: colors.neutral[0], borderRadius: 8, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.neutral[900] },
  cardStatus: { color: colors.primary[600], marginTop: 4 },
  cardMeta: { color: colors.neutral[500], fontSize: 12, marginTop: 4 },
});
