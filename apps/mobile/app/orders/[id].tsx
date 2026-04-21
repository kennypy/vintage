import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useAuth } from '../../src/contexts/AuthContext';
import { getOrder, markShipped, confirmReceipt, cancelOrder } from '../../src/services/orders';
import type { Order, OrderStatus } from '../../src/services/orders';

const CARRIERS = [
  { value: 'CORREIOS', label: 'Correios' },
  { value: 'SEDEX', label: 'Sedex' },
  { value: 'PAC', label: 'PAC' },
  { value: 'JADLOG', label: 'Jadlog' },
  { value: 'KANGU', label: 'Kangu' },
] as const;

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Aguardando pagamento',
  paid: 'Pago',
  shipped: 'Enviado',
  delivered: 'Entregue',
  held: 'Em custódia',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
};

const STATUS_TIMELINE: OrderStatus[] = ['pending_payment', 'paid', 'shipped', 'delivered', 'held', 'confirmed'];

const formatBrl = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user: authUser } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [shipModalVisible, setShipModalVisible] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState<string>('');
  const [trackingCodeInput, setTrackingCodeInput] = useState('');

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

  const handleOpenShipModal = () => {
    setSelectedCarrier('');
    setTrackingCodeInput('');
    setShipModalVisible(true);
  };

  const handleConfirmShip = async () => {
    if (!order) return;
    if (!selectedCarrier) {
      Alert.alert('Transportadora', 'Selecione uma transportadora.');
      return;
    }
    if (!trackingCodeInput.trim()) {
      Alert.alert('Código de rastreio', 'Informe o código de rastreio.');
      return;
    }
    setShipModalVisible(false);
    setActionLoading(true);
    try {
      const updated = await markShipped(order.id, trackingCodeInput.trim(), selectedCarrier);
      setOrder(updated);
      Alert.alert('Enviado!', 'Pedido marcado como enviado.');
    } catch (_error) {
      Alert.alert('Erro', 'Não foi possível atualizar o status.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelOrder = () => {
    if (!order) return;
    Alert.alert(
      'Cancelar pedido',
      'Tem certeza que deseja cancelar este pedido? Esta ação não pode ser desfeita.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Cancelar pedido',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const updated = await cancelOrder(order.id);
              setOrder(updated);
              Alert.alert('Cancelado', 'Seu pedido foi cancelado.');
            } catch (err) {
              const msg = err instanceof Error && err.message ? err.message : 'Não foi possível cancelar o pedido.';
              Alert.alert('Erro', msg);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
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
      {order.status === 'pending_payment' && isBuyer && (
        <>
          <TouchableOpacity
            style={[styles.actionButton, actionLoading && styles.actionDisabled]}
            onPress={() => router.push(`/orders/retry-payment?orderId=${order.id}`)}
            disabled={actionLoading}
          >
            <Ionicons name="refresh-outline" size={20} color={colors.neutral[0]} />
            <Text style={styles.actionButtonText}>Retentar pagamento</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.disputeButton, actionLoading && styles.actionDisabled]}
            onPress={handleCancelOrder}
            disabled={actionLoading}
            accessibilityRole="button"
            accessibilityLabel="Cancelar pedido"
          >
            <Ionicons name="close-circle-outline" size={20} color={colors.neutral[0]} />
            <Text style={styles.actionButtonText}>
              {actionLoading ? 'Cancelando...' : 'Cancelar pedido'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {order.status === 'held' && order.escrowReleasesAt && (
        <View style={styles.holdBanner}>
          <Ionicons name="time-outline" size={18} color={colors.neutral[0]} />
          <Text style={styles.holdBannerText}>
            Em custódia até {new Date(order.escrowReleasesAt).toLocaleDateString('pt-BR')}.
            {isBuyer ? ' Abra disputa ou devolução antes dessa data se houver problema.' : ''}
          </Text>
        </View>
      )}

      {(order.status === 'delivered' || order.status === 'held' || order.status === 'confirmed') && isBuyer && (
        <TouchableOpacity
          style={[styles.actionButton, styles.reviewButton]}
          onPress={() => router.push(`/returns/new?orderId=${order.id}`)}
        >
          <Ionicons name="return-up-back-outline" size={20} color={colors.neutral[0]} />
          <Text style={styles.actionButtonText}>Solicitar devolução</Text>
        </TouchableOpacity>
      )}

      {order.status === 'paid' && isSeller && (
        <TouchableOpacity
          style={[styles.actionButton, actionLoading && styles.actionDisabled]}
          onPress={handleOpenShipModal}
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

      {(order.status === 'delivered' || order.status === 'shipped') && isBuyer && (
        <TouchableOpacity
          style={[styles.actionButton, styles.disputeButton]}
          onPress={() => router.push(`/dispute/${order.id}`)}
        >
          <Ionicons name="shield-outline" size={20} color={colors.neutral[0]} />
          <Text style={styles.actionButtonText}>Abrir disputa</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />

      {/* Ship Modal */}
      <Modal
        visible={shipModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setShipModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enviar pedido</Text>

            <Text style={styles.modalLabel}>Transportadora</Text>
            <View style={styles.carrierList}>
              {CARRIERS.map((c) => (
                <TouchableOpacity
                  key={c.value}
                  style={[
                    styles.carrierButton,
                    selectedCarrier === c.value && styles.carrierButtonSelected,
                  ]}
                  onPress={() => setSelectedCarrier(c.value)}
                >
                  <Text
                    style={[
                      styles.carrierButtonText,
                      selectedCarrier === c.value && styles.carrierButtonTextSelected,
                    ]}
                  >
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Codigo de rastreio</Text>
            <TextInput
              style={styles.trackingInput}
              placeholder="Ex: BR123456789XX"
              placeholderTextColor={colors.neutral[400]}
              value={trackingCodeInput}
              onChangeText={setTrackingCodeInput}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShipModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmButton,
                  (!selectedCarrier || !trackingCodeInput.trim()) && styles.actionDisabled,
                ]}
                onPress={handleConfirmShip}
                disabled={!selectedCarrier || !trackingCodeInput.trim()}
              >
                <Text style={styles.modalConfirmText}>Confirmar envio</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  disputeButton: { backgroundColor: colors.error[500] },
  actionDisabled: { opacity: 0.6 },
  actionButtonText: { color: colors.neutral[0], fontSize: 15, fontWeight: '600' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.neutral[0],
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  modalTitle: {
    fontSize: 18, fontWeight: '700', color: colors.neutral[900],
    marginBottom: 16, textAlign: 'center',
  },
  modalLabel: {
    fontSize: 14, fontWeight: '600', color: colors.neutral[700],
    marginBottom: 8, marginTop: 12,
  },
  carrierList: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  carrierButton: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1.5,
    borderColor: colors.neutral[300], backgroundColor: colors.neutral[0],
  },
  carrierButtonSelected: {
    borderColor: colors.primary[600], backgroundColor: colors.primary[50],
  },
  carrierButtonText: {
    fontSize: 14, fontWeight: '500', color: colors.neutral[700],
  },
  carrierButtonTextSelected: {
    color: colors.primary[700], fontWeight: '600',
  },
  trackingInput: {
    borderWidth: 1, borderColor: colors.neutral[300], borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
    color: colors.neutral[900], backgroundColor: colors.neutral[50],
  },
  modalActions: {
    flexDirection: 'row', gap: 12, marginTop: 20,
  },
  modalCancelButton: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: colors.neutral[300],
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15, fontWeight: '600', color: colors.neutral[700],
  },
  modalConfirmButton: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: colors.primary[600], alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 15, fontWeight: '600', color: colors.neutral[0],
  },
  holdBanner: {
    backgroundColor: colors.warning[600],
    padding: 12, borderRadius: 8,
    flexDirection: 'row', gap: 8, alignItems: 'center',
    marginTop: 16, marginHorizontal: 16,
  },
  holdBannerText: {
    flex: 1, color: colors.neutral[0], fontSize: 13, fontWeight: '500',
  },
});
