import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
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
  const [activeTab, setActiveTab] = useState<'purchases' | 'sales'>('purchases');
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

  const renderOrder = ({ item }: { item: Order }) => (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => router.push(`/orders/${item.id}`)}
    >
      <View style={styles.orderHeader}>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] + '20' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
            {STATUS_LABELS[item.status]}
          </Text>
        </View>
        <Text style={styles.orderDate}>
          {new Date(item.createdAt).toLocaleDateString('pt-BR')}
        </Text>
      </View>
      <View style={styles.orderBody}>
        <View style={styles.orderImagePlaceholder}>
          <Ionicons name="image-outline" size={24} color={colors.neutral[300]} />
        </View>
        <View style={styles.orderInfo}>
          <Text style={styles.orderTitle} numberOfLines={2}>{item.item.title}</Text>
          <Text style={styles.orderSize}>Tam. {item.item.size}</Text>
          <Text style={styles.orderPrice}>R$ {formatBrl(item.totalBrl)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.neutral[400]} />
      </View>
      {item.shipping?.trackingCode && (
        <View style={styles.trackingRow}>
          <Ionicons name="cube-outline" size={16} color={colors.accent[600]} />
          <Text style={styles.trackingText}>
            Rastreio: {item.shipping.trackingCode}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'purchases' && styles.tabActive]}
          onPress={() => setActiveTab('purchases')}
        >
          <Text style={[styles.tabText, activeTab === 'purchases' && styles.tabTextActive]}>
            Compras
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'sales' && styles.tabActive]}
          onPress={() => setActiveTab('sales')}
        >
          <Text style={[styles.tabText, activeTab === 'sales' && styles.tabTextActive]}>
            Vendas
          </Text>
        </TouchableOpacity>
      </View>

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
              <Ionicons name="bag-outline" size={64} color={colors.neutral[300]} />
              <Text style={styles.emptyTitle}>
                {activeTab === 'purchases' ? 'Nenhuma compra' : 'Nenhuma venda'}
              </Text>
              <Text style={styles.emptyText}>
                {activeTab === 'purchases'
                  ? 'Seus pedidos aparecerão aqui.'
                  : 'Suas vendas aparecerão aqui.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabs: {
    flexDirection: 'row', backgroundColor: colors.neutral[0],
    borderBottomWidth: 1, borderBottomColor: colors.neutral[200],
  },
  tab: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary[600] },
  tabText: { fontSize: 15, fontWeight: '500', color: colors.neutral[500] },
  tabTextActive: { color: colors.primary[600], fontWeight: '600' },
  list: { padding: 12 },
  orderCard: {
    backgroundColor: colors.neutral[0], borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: colors.neutral[200],
  },
  orderHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '600' },
  orderDate: { fontSize: 12, color: colors.neutral[400] },
  orderBody: { flexDirection: 'row', alignItems: 'center' },
  orderImagePlaceholder: {
    width: 60, height: 60, borderRadius: 8, backgroundColor: colors.neutral[100],
    justifyContent: 'center', alignItems: 'center',
  },
  orderInfo: { flex: 1, marginLeft: 12 },
  orderTitle: { fontSize: 14, fontWeight: '500', color: colors.neutral[800] },
  orderSize: { fontSize: 12, color: colors.neutral[500], marginTop: 2 },
  orderPrice: { fontSize: 15, fontWeight: '700', color: colors.neutral[900], marginTop: 4 },
  trackingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.neutral[200],
  },
  trackingText: { fontSize: 13, color: colors.accent[600], fontWeight: '500' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.neutral[900], marginTop: 16 },
  emptyText: { fontSize: 14, color: colors.neutral[400], marginTop: 4 },
});
