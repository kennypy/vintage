import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useAuth } from '../../src/contexts/AuthContext';
import { getOrder, markShipped, confirmReceipt } from '../../src/services/orders';
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

const STATUS_TIMELINE: OrderStatus[] = ['pending_payment', 'paid', 'shipped', 'delivered', 'confirmed'];

const formatBrl = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user: authUser } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    async function fetchOrder() {
      try {
        const data = await getOrder(id ?? '');
        setOrder(data);
      } catch (_error) {
        Alert.alert('Erro', 'Não foi possível carregar o pedido.');
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [id]);

  const handleMarkShipped = () => {
    Alert.prompt
      ? Alert.prompt('Código de rastreio', 'Informe o código de rastreio:', async (trackingCode) => {
          if (!trackingCode || !order) return;
          setActionLoading(true);
          try {
            const updated = await markShipped(order.id, trackingCode, 'Correios');
            setOrder(updated);
            Alert.alert('Enviado!', 'Pedido marcado como enviado.');
          } catch (_error) {
            Alert.alert('Erro', 'Não foi possível atualizar o status.');
          } finally {
            setActionLoading(false);
          }
        })
      : handleMarkShippedFallback();
  };

  const handleMarkShippedFallback = async () => {
    if (!order) return;
    setActionLoading(true);
    try {
      const updated = await markShipped(order.id, 'TRACKING_CODE', 'Correios');
      setOrder(updated);
      Alert.alert('Enviado!', 'Pedido marcado como enviado.');
    } catch (_error) {
      Alert.alert('Erro', 'Não foi possível atualizar o status.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReceipt = () => {
    if (!order) return;
    Alert.alert(
      'Confirmar recebimento',
      'Você confirma que recebeu o item em boas condições?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setActionLoading(true);
            try {
              const updated = await confirmReceipt(order.id);
              setOrder(updated);
              Alert.alert('Confirmado!', 'Recebimento confirmado com sucesso.');
            } catch (_error) {
              Alert.alert('Erro', 'Não foi possível confirmar o recebimento.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  };

  if (loading || !order) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  const currentStatusIndex = STATUS_TIMELINE.indexOf(order.status);
  const isSeller = authUser?.id === order.seller?.id;
  const isBuyer = authUser?.id === order.buyer?.id;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Status Timeline */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Status do pedido</Text>
        {STATUS_TIMELINE.map((status, index) => {
          const isActive = index <= currentStatusIndex;
          const isCurrent = status === order.status;
          return (
            <View key={status} style={styles.timelineItem}>
              <View style={styles.timelineLeft}>
                <View style={[
                  styles.timelineDot,
                  isActive && styles.timelineDotActive,
                  isCurrent && styles.timelineDotCurrent,
                ]}>
                  {isActive && <Ionicons name="checkmark" size={12} color={colors.neutral[0]} />}
                </View>
                {index < STATUS_TIMELINE.length - 1 && (
                  <View style={[styles.timelineLine, isActive && styles.timelineLineActive]} />
                )}
              </View>
              <Text style={[styles.timelineLabel, isActive && styles.timelineLabelActive]}>
                {STATUS_LABELS[status]}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Order Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Detalhes do pedido</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Pedido</Text>
          <Text style={styles.detailValue}>#{order.id.slice(0, 8)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Item</Text>
          <Text style={styles.detailValue}>{order.item.title}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Tamanho</Text>
          <Text style={styles.detailValue}>{order.item.size}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Subtotal</Text>
          <Text style={styles.detailValue}>R$ {formatBrl(order.item.priceBrl)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Frete</Text>
          <Text style={styles.detailValue}>R$ {formatBrl(order.shippingBrl)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Taxa</Text>
          <Text style={styles.detailValue}>R$ {formatBrl(order.feeBrl)}</Text>
        </View>
        <View style={[styles.detailRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>R$ {formatBrl(order.totalBrl)}</Text>
        </View>
      </View>

      {/* Shipping Info */}
      {order.shipping && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Envio</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Transportadora</Text>
            <Text style={styles.detailValue}>{order.shipping.carrier}</Text>
          </View>
          {order.shipping.trackingCode && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Código de rastreio</Text>
              <Text style={[styles.detailValue, styles.trackingCode]}>
                {order.shipping.trackingCode}
              </Text>
            </View>
          )}
          {order.shipping.estimatedDelivery && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Previsão de entrega</Text>
              <Text style={styles.detailValue}>
                {new Date(order.shipping.estimatedDelivery).toLocaleDateString('pt-BR')}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Address */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Endereço de entrega</Text>
        <Text style={styles.addressLine}>
          {order.address.street}, {order.address.number}
          {order.address.complement ? ` - ${order.address.complement}` : ''}
        </Text>
        <Text style={styles.addressLine}>
          {order.address.neighborhood} - {order.address.city}, {order.address.state}
        </Text>
        <Text style={styles.addressLine}>CEP: {order.address.cep}</Text>
      </View>

      {/* Actions */}
      {order.status === 'paid' && isSeller && (
        <TouchableOpacity
          style={[styles.actionButton, actionLoading && styles.actionDisabled]}
          onPress={handleMarkShipped}
          disabled={actionLoading}
        >
          <Ionicons name="cube-outline" size={20} color={colors.neutral[0]} />
          <Text style={styles.actionButtonText}>
            {actionLoading ? 'Atualizando...' : 'Marcar como enviado'}
          </Text>
        </TouchableOpacity>
      )}

      {order.status === 'delivered' && isBuyer && (
        <TouchableOpacity
          style={[styles.actionButton, styles.confirmButton, actionLoading && styles.actionDisabled]}
          onPress={handleConfirmReceipt}
          disabled={actionLoading}
        >
          <Ionicons name="checkmark-circle-outline" size={20} color={colors.neutral[0]} />
          <Text style={styles.actionButtonText}>
            {actionLoading ? 'Confirmando...' : 'Confirmar recebimento'}
          </Text>
        </TouchableOpacity>
      )}

      {order.status === 'confirmed' && isBuyer && (
        <TouchableOpacity
          style={[styles.actionButton, styles.reviewButton]}
          onPress={() => router.push(`/reviews/write?orderId=${order.id}`)}
        >
          <Ionicons name="star-outline" size={20} color={colors.neutral[0]} />
          <Text style={styles.actionButtonText}>Deixar avaliação</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  centered: { justifyContent: 'center', alignItems: 'center' },
  section: {
    backgroundColor: colors.neutral[0], paddingHorizontal: 16, paddingVertical: 14,
    marginTop: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.neutral[900], marginBottom: 12 },
  timelineItem: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 40 },
  timelineLeft: { alignItems: 'center', width: 24, marginRight: 12 },
  timelineDot: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: colors.neutral[200],
    justifyContent: 'center', alignItems: 'center',
  },
  timelineDotActive: { backgroundColor: colors.success[500] },
  timelineDotCurrent: { backgroundColor: colors.primary[600] },
  timelineLine: { width: 2, flex: 1, backgroundColor: colors.neutral[200], marginVertical: 2 },
  timelineLineActive: { backgroundColor: colors.success[500] },
  timelineLabel: { fontSize: 14, color: colors.neutral[400], paddingTop: 1 },
  timelineLabelActive: { color: colors.neutral[800], fontWeight: '500' },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6,
  },
  detailLabel: { fontSize: 14, color: colors.neutral[500] },
  detailValue: { fontSize: 14, color: colors.neutral[800], fontWeight: '500' },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.neutral[200], marginTop: 8, paddingTop: 10 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: colors.neutral[900] },
  totalValue: { fontSize: 16, fontWeight: '700', color: colors.primary[600] },
  trackingCode: { color: colors.accent[600] },
  addressLine: { fontSize: 14, color: colors.neutral[600], lineHeight: 22 },
  actionButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    margin: 16, paddingVertical: 14, borderRadius: 12,
    backgroundColor: colors.primary[600],
  },
  confirmButton: { backgroundColor: colors.success[600] },
  reviewButton: { backgroundColor: colors.accent[500] },
  actionDisabled: { opacity: 0.6 },
  actionButtonText: { color: colors.neutral[0], fontSize: 15, fontWeight: '600' },
});
