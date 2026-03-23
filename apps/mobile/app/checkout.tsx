import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme/colors';
import { createOrder } from '../src/services/orders';

type PaymentMethod = 'pix' | 'credit_card' | 'boleto';

const formatBrl = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    listingId: string;
    title: string;
    priceBrl: string;
    imageUrl: string;
  }>();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [installments, setInstallments] = useState(1);
  const [paying, setPaying] = useState(false);

  const itemPrice = params.priceBrl ? parseFloat(params.priceBrl) : 89.9;
  const listingTitle = params.title ?? 'Item';
  const shippingCost = 18.9;
  const buyerProtectionFee = 3.5 + itemPrice * 0.05;
  const total = itemPrice + shippingCost + buyerProtectionFee;

  const installmentOptions = [1, 2, 3, 6, 10, 12];

  const handlePay = async () => {
    if (!params.listingId) {
      Alert.alert('Erro', 'Dados do anúncio não encontrados.');
      return;
    }

    setPaying(true);
    try {
      await createOrder({
        listingId: params.listingId,
        addressId: 'default',
        shippingOptionId: 'standard',
      });
      Alert.alert(
        'Pedido realizado!',
        `Seu pedido de "${listingTitle}" foi realizado com sucesso.`,
        [
          {
            text: 'Ver pedidos',
            onPress: () => {
              router.dismiss();
              router.push('/orders');
            },
          },
          {
            text: 'OK',
            onPress: () => router.dismiss(),
          },
        ],
      );
    } catch (_error) {
      Alert.alert('Erro no pagamento', 'Não foi possível processar o pagamento. Tente novamente.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Item Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Item</Text>
          <Text style={styles.itemTitle}>{listingTitle}</Text>
          <Text style={styles.itemPrice}>R$ {formatBrl(itemPrice)}</Text>
        </View>

        {/* Address */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Endereço de entrega</Text>
          <TouchableOpacity style={styles.addressCard}>
            <Ionicons name="location-outline" size={20} color={colors.neutral[600]} />
            <View style={styles.addressInfo}>
              <Text style={styles.addressLabel}>Casa</Text>
              <Text style={styles.addressText}>Rua das Flores, 123 - Jardim Paulista</Text>
              <Text style={styles.addressText}>São Paulo, SP - 01234-567</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />
          </TouchableOpacity>
        </View>

        {/* Payment Method */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Forma de pagamento</Text>

          {/* PIX */}
          <TouchableOpacity
            style={[styles.paymentOption, paymentMethod === 'pix' && styles.paymentSelected]}
            onPress={() => setPaymentMethod('pix')}
          >
            <View style={styles.paymentLeft}>
              <View style={[styles.pixBadge]}>
                <Text style={styles.pixText}>PIX</Text>
              </View>
              <View>
                <Text style={styles.paymentLabel}>PIX</Text>
                <Text style={styles.paymentDesc}>Aprovação instantânea</Text>
              </View>
            </View>
            <Ionicons
              name={paymentMethod === 'pix' ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={paymentMethod === 'pix' ? colors.pix : colors.neutral[300]}
            />
          </TouchableOpacity>

          {/* Credit Card */}
          <TouchableOpacity
            style={[styles.paymentOption, paymentMethod === 'credit_card' && styles.paymentSelected]}
            onPress={() => setPaymentMethod('credit_card')}
          >
            <View style={styles.paymentLeft}>
              <Ionicons name="card-outline" size={24} color={colors.neutral[600]} />
              <View>
                <Text style={styles.paymentLabel}>Cartão de crédito</Text>
                <Text style={styles.paymentDesc}>Parcele em até 12x</Text>
              </View>
            </View>
            <Ionicons
              name={paymentMethod === 'credit_card' ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={paymentMethod === 'credit_card' ? colors.primary[600] : colors.neutral[300]}
            />
          </TouchableOpacity>

          {/* Boleto */}
          <TouchableOpacity
            style={[styles.paymentOption, paymentMethod === 'boleto' && styles.paymentSelected]}
            onPress={() => setPaymentMethod('boleto')}
          >
            <View style={styles.paymentLeft}>
              <Ionicons name="barcode-outline" size={24} color={colors.neutral[600]} />
              <View>
                <Text style={styles.paymentLabel}>Boleto bancário</Text>
                <Text style={styles.paymentDesc}>Aprovação em 1-3 dias úteis</Text>
              </View>
            </View>
            <Ionicons
              name={paymentMethod === 'boleto' ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={paymentMethod === 'boleto' ? colors.primary[600] : colors.neutral[300]}
            />
          </TouchableOpacity>
        </View>

        {/* Installments (if credit card) */}
        {paymentMethod === 'credit_card' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Parcelas</Text>
            {installmentOptions.map((n) => {
              const installmentAmount = total / n;
              return (
                <TouchableOpacity
                  key={n}
                  style={[styles.installmentOption, installments === n && styles.installmentSelected]}
                  onPress={() => setInstallments(n)}
                >
                  <Text style={styles.installmentLabel}>
                    {n}x de R$ {formatBrl(installmentAmount)}
                  </Text>
                  {n === 1 && <Text style={styles.installmentHint}>sem juros</Text>}
                  <Ionicons
                    name={installments === n ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={installments === n ? colors.primary[600] : colors.neutral[300]}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumo do pedido</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Item</Text>
            <Text style={styles.summaryValue}>R$ {formatBrl(itemPrice)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Frete</Text>
            <Text style={styles.summaryValue}>R$ {formatBrl(shippingCost)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Proteção ao comprador</Text>
            <Text style={styles.summaryValue}>R$ {formatBrl(buyerProtectionFee)}</Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>R$ {formatBrl(total)}</Text>
          </View>
        </View>

        {/* Buyer Protection Info */}
        <View style={styles.protectionBanner}>
          <Ionicons name="shield-checkmark" size={20} color={colors.success[600]} />
          <View style={styles.protectionInfo}>
            <Text style={styles.protectionTitle}>Proteção ao comprador</Text>
            <Text style={styles.protectionDesc}>
              Seu pagamento fica protegido. Se o item não chegar ou não for como descrito,
              você recebe o reembolso.
            </Text>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomTotal}>
          <Text style={styles.bottomTotalLabel}>Total</Text>
          <Text style={styles.bottomTotalValue}>
            R$ {formatBrl(total)}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.payButton, paying && styles.payButtonDisabled]}
          onPress={handlePay}
          disabled={paying}
        >
          {paying ? (
            <ActivityIndicator color={colors.neutral[0]} size="small" />
          ) : (
            <Text style={styles.payButtonText}>
              {paymentMethod === 'pix' ? 'Pagar com PIX' :
                paymentMethod === 'credit_card' ? 'Pagar com cartão' : 'Gerar boleto'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  scroll: { flex: 1 },
  section: {
    backgroundColor: colors.neutral[0],
    paddingHorizontal: 16, paddingVertical: 14,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16, fontWeight: '600', color: colors.neutral[900], marginBottom: 12,
  },
  itemTitle: { fontSize: 15, color: colors.neutral[700] },
  itemPrice: { fontSize: 18, fontWeight: '700', color: colors.neutral[900], marginTop: 4 },
  addressCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, backgroundColor: colors.neutral[50], borderRadius: 10,
  },
  addressInfo: { flex: 1 },
  addressLabel: { fontSize: 14, fontWeight: '600', color: colors.neutral[800] },
  addressText: { fontSize: 13, color: colors.neutral[500], marginTop: 2 },
  paymentOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.neutral[200],
    marginBottom: 8,
  },
  paymentSelected: { borderColor: colors.primary[400], backgroundColor: colors.primary[50] },
  paymentLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  paymentLabel: { fontSize: 15, fontWeight: '500', color: colors.neutral[800] },
  paymentDesc: { fontSize: 12, color: colors.neutral[500], marginTop: 1 },
  pixBadge: {
    backgroundColor: colors.pix, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6,
  },
  pixText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  installmentOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 8, marginBottom: 4,
  },
  installmentSelected: { backgroundColor: colors.primary[50] },
  installmentLabel: { fontSize: 14, color: colors.neutral[800] },
  installmentHint: { fontSize: 12, color: colors.success[600], fontWeight: '500' },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4,
  },
  summaryLabel: { fontSize: 14, color: colors.neutral[500] },
  summaryValue: { fontSize: 14, color: colors.neutral[700] },
  totalRow: {
    borderTopWidth: 1, borderTopColor: colors.neutral[200],
    marginTop: 8, paddingTop: 8,
  },
  totalLabel: { fontSize: 16, fontWeight: '700', color: colors.neutral[900] },
  totalValue: { fontSize: 16, fontWeight: '700', color: colors.primary[600] },
  protectionBanner: {
    flexDirection: 'row', gap: 12, marginTop: 8,
    backgroundColor: colors.success[500] + '10',
    padding: 14, marginHorizontal: 0,
  },
  protectionInfo: { flex: 1 },
  protectionTitle: { fontSize: 14, fontWeight: '600', color: colors.success[600] },
  protectionDesc: { fontSize: 12, color: colors.neutral[600], marginTop: 4, lineHeight: 18 },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 28,
    backgroundColor: colors.neutral[0],
    borderTopWidth: 1, borderTopColor: colors.neutral[200],
  },
  bottomTotal: {},
  bottomTotalLabel: { fontSize: 12, color: colors.neutral[500] },
  bottomTotalValue: { fontSize: 18, fontWeight: '700', color: colors.neutral[900] },
  payButton: {
    backgroundColor: colors.primary[600], paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 12,
  },
  payButtonDisabled: { opacity: 0.6 },
  payButtonText: { color: colors.neutral[0], fontSize: 15, fontWeight: '600' },
});
