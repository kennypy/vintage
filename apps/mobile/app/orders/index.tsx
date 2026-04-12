import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { getOrders } from '../../src/services/orders';
import type { Order, OrderStatus } from '../../src/services/orders';

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Aguardando pagamento',
  paid: 'Pago',
  shipped: 'Enviado',
  delivered: 'Entregue',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending_payment: colors.warning[500],
  paid: colors.primary[500],
  shipped: colors.accent[500],
  delivered: colors.success[500],
  confirmed: colors.success[600],
  cancelled: colors.error[500],
  refunded: colors.neutral[500],
};

const formatBrl = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function OrdersScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [activeTab] = useState<'purchases' | 'sales'>('purchases');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const response = await getOrders(activeTab);
      setOrders(response.items);
    } catch (_error) {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setLoading(true);
    fetchOrders();
  }, [fetchOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, [fetchOrders]);

  const renderOrder = useCallback(({ item }: { item: Order }) => (
    <TouchableOpacity
      style={[styles.orderCard, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={() => router.push(`/orders/${item.id}`)}
    >
      <View style={styles.orderHeader}>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] + '20' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
            {STATUS_LABELS[item.status]}
          </Text>
        </View>
        <Text style={[styles.orderDate, { color: theme.textTertiary }]}>
          {new Date(item.createdAt).toLocaleDateString('pt-BR')}
        </Text>
      </View>
      <View style={styles.orderBody}>
        <View style={[styles.orderImagePlaceholder, { backgroundColor: theme.inputBg }]}>
          <Ionicons name="image-outline" size={24} color={theme.textTertiary} />
        </View>
        <View style={styles.orderInfo}>
          <Text style={[styles.orderTitle, { color: theme.text }]} numberOfLines={2}>{item.item.title}</Text>
          <Text style={[styles.orderSize, { color: theme.textSecondary }]}>Tam. {item.item.size}</Text>
          <Text style={[styles.orderPrice, { color: theme.text }]}>R$ {formatBrl(item.totalBrl)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
      </View>
      {item.shipping?.trackingCode && (
        <View style={[styles.trackingRow, { borderTopColor: theme.border }]}>
          <Ionicons name="cube-outline" size={16} color={colors.accent[600]} />
          <Text style={styles.trackingText}>
            Rastreio: {item.shipping.trackingCode}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  ), [theme, router]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="bag-outline" size={64} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Nenhuma compra</Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                Seus pedidos aparecerão aqui.
              </Text>
            </View>
          }
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={11}
          initialNumToRender={8}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary[600] },
  tabText: { fontSize: 15, fontWeight: '500' },
  tabTextActive: { color: colors.primary[600], fontWeight: '600' },
  list: { padding: 12 },
  orderCard: {
    borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1,
  },
  orderHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '600' },
  orderDate: { fontSize: 12 },
  orderBody: { flexDirection: 'row', alignItems: 'center' },
  orderImagePlaceholder: {
    width: 60, height: 60, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  orderInfo: { flex: 1, marginLeft: 12 },
  orderTitle: { fontSize: 14, fontWeight: '500' },
  orderSize: { fontSize: 12, marginTop: 2 },
  orderPrice: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  trackingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  trackingText: { fontSize: 13, color: colors.accent[600], fontWeight: '500' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptyText: { fontSize: 14, marginTop: 4 },
});
