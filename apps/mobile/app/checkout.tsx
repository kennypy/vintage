import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme/colors';
import { useTheme } from '../src/contexts/ThemeContext';
import { createOrder } from '../src/services/orders';
import { getAddresses, Address } from '../src/services/addresses';
import { validateCoupon, CouponValidationResult } from '../src/services/coupons';
import { BUYER_PROTECTION_FIXED_BRL, BUYER_PROTECTION_RATE } from '@vintage/shared';

type PaymentMethod = 'pix' | 'credit_card' | 'boleto';

const formatBrl = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{
    listingId: string;
    title: string;
    priceBrl: string;
    imageUrl: string;
  }>();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [installments, setInstallments] = useState(1);
  const [paying, setPaying] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [couponResult, setCouponResult] = useState<CouponValidationResult | null>(null);
  const [couponError, setCouponError] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  useEffect(() => {
    async function fetchAddresses() {
      try {
        const data = await getAddresses();
        setAddresses(data);
        const defaultAddr = data.find((a) => a.isDefault) ?? data[0] ?? null;
        setSelectedAddress(defaultAddr);
      } catch (_error) {
        // fallback to no address
      }
    }
    fetchAddresses();
  }, []);

  const itemPrice = params.priceBrl ? parseFloat(params.priceBrl) : 89.9;
  const listingTitle = params.title ?? 'Item';
  // Shipping cost estimate — real cost is calculated by the API when the order is created
  const shippingCost = 18.9;
  const buyerProtectionFee = BUYER_PROTECTION_FIXED_BRL + itemPrice * BUYER_PROTECTION_RATE;
  const subtotal = itemPrice + shippingCost + buyerProtectionFee;
  const discount = couponResult?.discountBrl ?? 0;
  const total = Math.max(0, subtotal - discount);
  const isFreeOrder = total === 0;

  const installmentOptions = [1, 2, 3, 6, 10, 12];

  const handleApplyCoupon = async () => {
    const trimmed = couponInput.trim().toUpperCase();
    if (!trimmed) return;
    setApplyingCoupon(true);
    setCouponError('');
    setCouponResult(null);
    try {
      const result = await validateCoupon(trimmed, subtotal);
      setCouponResult(result);
      setCouponCode(trimmed);
    } catch (_err) {
      setCouponError('Cupom inválido, expirado ou não encontrado.');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponResult(null);
    setCouponCode('');
    setCouponInput('');
    setCouponError('');
  };

  const hasNoAddresses = addresses.length === 0;
  const isAddressSelected = selectedAddress !== null;

  const handlePay = async () => {
    if (!params.listingId) {
      Alert.alert('Erro', 'Dados do anúncio não encontrados.');
      return;
    }

    if (!selectedAddress) {
      Alert.alert('Endereço necessário', 'Selecione um endereço de entrega');
      return;
    }

    setPaying(true);
    try {
      await createOrder({
        listingId: params.listingId,
        addressId: selectedAddress.id,
        paymentMethod: paymentMethod.toUpperCase() as 'PIX' | 'CREDIT_CARD' | 'BOLETO',
        installments: paymentMethod === 'credit_card' ? installments : undefined,
        couponCode: couponCode || undefined,
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

  const paymentSelectedStyle = { borderColor: colors.primary[400], backgroundColor: theme.isDark ? colors.primary[900] + '40' : colors.primary[50] };
  const installmentSelectedStyle = { backgroundColor: theme.isDark ? colors.primary[900] + '40' : colors.primary[50] };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Item Info */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Item</Text>
          <Text style={[styles.itemTitle, { color: theme.textSecondary }]}>{listingTitle}</Text>
          <Text style={[styles.itemPrice, { color: theme.text }]}>R$ {formatBrl(itemPrice)}</Text>
        </View>

        {/* Address */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Endereço de entrega</Text>
          {hasNoAddresses ? (
            <TouchableOpacity
              style={[styles.addAddressCta, { borderColor: colors.primary[400] }]}
              onPress={() => router.push('/addresses')}
            >
              <Ionicons name="add-circle" size={28} color={colors.primary[600]} />
              <View style={styles.addAddressCtaInfo}>
                <Text style={[styles.addAddressCtaTitle, { color: colors.primary[600] }]}>
                  Adicionar endereço de entrega
                </Text>
                <Text style={[styles.addAddressCtaDesc, { color: theme.textSecondary }]}>
                  Você precisa cadastrar um endereço para finalizar a compra
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.primary[600]} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.addressCard, { backgroundColor: theme.inputBg }]}
              onPress={() => router.push('/addresses')}
            >
              <Ionicons name="location-outline" size={20} color={theme.textSecondary} />
              <View style={styles.addressInfo}>
                {selectedAddress ? (
                  <>
                    <Text style={[styles.addressLabel, { color: theme.text }]}>{selectedAddress.label}</Text>
                    <Text style={[styles.addressText, { color: theme.textSecondary }]}>
                      {selectedAddress.street}, {selectedAddress.number}
                      {selectedAddress.complement ? ` - ${selectedAddress.complement}` : ''}
                    </Text>
                    <Text style={[styles.addressText, { color: theme.textSecondary }]}>
                      {selectedAddress.city}, {selectedAddress.state} - {selectedAddress.cep}
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.addressText, { color: theme.textSecondary }]}>Selecione um endereço de entrega</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Payment Method */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Forma de pagamento</Text>

          {/* PIX */}
          <TouchableOpacity
            style={[styles.paymentOption, { borderColor: theme.border }, paymentMethod === 'pix' && paymentSelectedStyle]}
            onPress={() => setPaymentMethod('pix')}
          >
            <View style={styles.paymentLeft}>
              <View style={styles.pixBadge}>
                <Text style={styles.pixText}>PIX</Text>
              </View>
              <View>
                <Text style={[styles.paymentLabel, { color: theme.text }]}>PIX</Text>
                <Text style={[styles.paymentDesc, { color: theme.textSecondary }]}>Aprovação instantânea</Text>
              </View>
            </View>
            <Ionicons
              name={paymentMethod === 'pix' ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={paymentMethod === 'pix' ? colors.pix : theme.textTertiary}
            />
          </TouchableOpacity>

          {/* Credit Card */}
          <TouchableOpacity
            style={[styles.paymentOption, { borderColor: theme.border }, paymentMethod === 'credit_card' && paymentSelectedStyle]}
            onPress={() => setPaymentMethod('credit_card')}
          >
            <View style={styles.paymentLeft}>
              <Ionicons name="card-outline" size={24} color={theme.textSecondary} />
              <View>
                <Text style={[styles.paymentLabel, { color: theme.text }]}>Cartão de crédito</Text>
                <Text style={[styles.paymentDesc, { color: theme.textSecondary }]}>Parcele em até 12x</Text>
              </View>
            </View>
            <Ionicons
              name={paymentMethod === 'credit_card' ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={paymentMethod === 'credit_card' ? colors.primary[600] : theme.textTertiary}
            />
          </TouchableOpacity>

          {/* Boleto */}
          <TouchableOpacity
            style={[styles.paymentOption, { borderColor: theme.border }, paymentMethod === 'boleto' && paymentSelectedStyle]}
            onPress={() => setPaymentMethod('boleto')}
          >
            <View style={styles.paymentLeft}>
              <Ionicons name="barcode-outline" size={24} color={theme.textSecondary} />
              <View>
                <Text style={[styles.paymentLabel, { color: theme.text }]}>Boleto bancário</Text>
                <Text style={[styles.paymentDesc, { color: theme.textSecondary }]}>Aprovação em 1-3 dias úteis</Text>
              </View>
            </View>
            <Ionicons
              name={paymentMethod === 'boleto' ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={paymentMethod === 'boleto' ? colors.primary[600] : theme.textTertiary}
            />
          </TouchableOpacity>
        </View>

        {/* Installments (if credit card) */}
        {paymentMethod === 'credit_card' && (
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Parcelas</Text>
            {installmentOptions.map((n) => {
              const installmentAmount = total / n;
              return (
                <TouchableOpacity
                  key={n}
                  style={[styles.installmentOption, installments === n && installmentSelectedStyle]}
                  onPress={() => setInstallments(n)}
                >
                  <Text style={[styles.installmentLabel, { color: theme.text }]}>
                    {n}x de R$ {formatBrl(installmentAmount)}
                  </Text>
                  {n === 1 && <Text style={styles.installmentHint}>sem juros</Text>}
                  <Ionicons
                    name={installments === n ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={installments === n ? colors.primary[600] : theme.textTertiary}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Coupon Code */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Cupom de desconto</Text>
          {couponResult ? (
            <View style={[styles.couponApplied, { backgroundColor: colors.success[500] + '15', borderColor: colors.success[500] }]}>
              <Ionicons name="pricetag" size={18} color={colors.success[600]} />
              <View style={styles.couponAppliedInfo}>
                <Text style={[styles.couponAppliedCode, { color: colors.success[700] }]}>{couponResult.code}</Text>
                <Text style={[styles.couponAppliedDesc, { color: colors.success[600] }]}>
                  {couponResult.discountPct}% de desconto — R$ {formatBrl(couponResult.discountBrl)} de economia
                </Text>
              </View>
              <TouchableOpacity onPress={handleRemoveCoupon}>
                <Ionicons name="close-circle" size={20} color={colors.success[600]} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.couponRow}>
              <TextInput
                style={[styles.couponInput, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                placeholder="CÓDIGO DO CUPOM"
                placeholderTextColor={theme.textTertiary}
                value={couponInput}
                onChangeText={setCouponInput}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.couponButton, { backgroundColor: colors.primary[600] }, applyingCoupon && styles.payButtonDisabled]}
                onPress={handleApplyCoupon}
                disabled={applyingCoupon || !couponInput.trim()}
              >
                {applyingCoupon
                  ? <ActivityIndicator color={colors.neutral[0]} size="small" />
                  : <Text style={styles.couponButtonText}>Aplicar</Text>
                }
              </TouchableOpacity>
            </View>
          )}
          {!!couponError && (
            <Text style={styles.couponError}>{couponError}</Text>
          )}
        </View>

        {/* Summary */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Resumo do pedido</Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Item</Text>
            <Text style={[styles.summaryValue, { color: theme.textSecondary }]}>R$ {formatBrl(itemPrice)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Frete</Text>
            <Text style={[styles.summaryValue, { color: theme.textSecondary }]}>R$ {formatBrl(shippingCost)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Proteção ao comprador</Text>
            <Text style={[styles.summaryValue, { color: theme.textSecondary }]}>R$ {formatBrl(buyerProtectionFee)}</Text>
          </View>
          {couponResult && (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.success[600] }]}>Cupom {couponResult.code}</Text>
              <Text style={[styles.summaryValue, { color: colors.success[600] }]}>– R$ {formatBrl(couponResult.discountBrl)}</Text>
            </View>
          )}
          <View style={[styles.summaryRow, styles.totalRow, { borderTopColor: theme.border }]}>
            <Text style={[styles.totalLabel, { color: theme.text }]}>Total</Text>
            <Text style={[styles.totalValue, { color: isFreeOrder ? colors.success[600] : colors.primary[600] }]}>
              {isFreeOrder ? 'Grátis' : `R$ ${formatBrl(total)}`}
            </Text>
          </View>
        </View>

        {/* Buyer Protection Info */}
        <View style={[styles.protectionBanner, { backgroundColor: colors.success[500] + '15' }]}>
          <Ionicons name="shield-checkmark" size={20} color={colors.success[600]} />
          <View style={styles.protectionInfo}>
            <Text style={[styles.protectionTitle, { color: colors.success[600] }]}>Proteção ao comprador</Text>
            <Text style={[styles.protectionDesc, { color: theme.textSecondary }]}>
              Seu pagamento fica protegido. Se o item não chegar ou não for como descrito,
              você recebe o reembolso.
            </Text>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={[
        styles.bottomBar,
        { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 12) },
      ]}>
        <View style={styles.bottomTotal}>
          <Text style={[styles.bottomTotalLabel, { color: theme.textSecondary }]}>Total</Text>
          <Text style={[styles.bottomTotalValue, { color: isFreeOrder ? colors.success[600] : theme.text }]}>
            {isFreeOrder ? 'Grátis' : `R$ ${formatBrl(total)}`}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.payButton, isFreeOrder && styles.payButtonFree, (paying || !isAddressSelected) && styles.payButtonDisabled]}
          onPress={handlePay}
          disabled={paying || !isAddressSelected}
        >
          {paying ? (
            <ActivityIndicator color={colors.neutral[0]} size="small" />
          ) : (
            <Text style={styles.payButtonText}>
              {isFreeOrder ? 'Confirmar pedido grátis' :
                paymentMethod === 'pix' ? 'Pagar com PIX' :
                paymentMethod === 'credit_card' ? 'Pagar com cartão' : 'Gerar boleto'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  section: {
    paddingHorizontal: 16, paddingVertical: 14,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16, fontWeight: '600', marginBottom: 12,
  },
  itemTitle: { fontSize: 15 },
  itemPrice: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  addressCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 10,
  },
  addressInfo: { flex: 1 },
  addressLabel: { fontSize: 14, fontWeight: '600' },
  addressText: { fontSize: 13, marginTop: 2 },
  addAddressCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 12, borderWidth: 2,
    borderStyle: 'dashed',
  },
  addAddressCtaInfo: { flex: 1 },
  addAddressCtaTitle: { fontSize: 15, fontWeight: '600' },
  addAddressCtaDesc: { fontSize: 12, marginTop: 4, lineHeight: 18 },
  paymentOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, borderRadius: 10, borderWidth: 1,
    marginBottom: 8,
  },
  paymentLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  paymentLabel: { fontSize: 15, fontWeight: '500' },
  paymentDesc: { fontSize: 12, marginTop: 1 },
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
  installmentLabel: { fontSize: 14 },
  installmentHint: { fontSize: 12, color: colors.success[600], fontWeight: '500' },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4,
  },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14 },
  totalRow: {
    borderTopWidth: 1,
    marginTop: 8, paddingTop: 8,
  },
  totalLabel: { fontSize: 16, fontWeight: '700' },
  totalValue: { fontSize: 16, fontWeight: '700' },
  protectionBanner: {
    flexDirection: 'row', gap: 12, marginTop: 8,
    padding: 14,
  },
  protectionInfo: { flex: 1 },
  protectionTitle: { fontSize: 14, fontWeight: '600' },
  protectionDesc: { fontSize: 12, marginTop: 4, lineHeight: 18 },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1,
  },
  bottomTotal: {},
  bottomTotalLabel: { fontSize: 12 },
  bottomTotalValue: { fontSize: 18, fontWeight: '700' },
  payButton: {
    backgroundColor: colors.primary[600], paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 12,
  },
  payButtonFree: { backgroundColor: colors.success[600] },
  payButtonDisabled: { opacity: 0.6 },
  payButtonText: { color: colors.neutral[0], fontSize: 15, fontWeight: '600' },
  couponRow: { flexDirection: 'row', gap: 8 },
  couponInput: {
    flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, letterSpacing: 1,
  },
  couponButton: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', minWidth: 80,
  },
  couponButtonText: { color: colors.neutral[0], fontSize: 14, fontWeight: '600' },
  couponApplied: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  couponAppliedInfo: { flex: 1 },
  couponAppliedCode: { fontSize: 14, fontWeight: '700' },
  couponAppliedDesc: { fontSize: 12, marginTop: 2 },
  couponError: { color: '#ef4444', fontSize: 12, marginTop: 6 },
});
