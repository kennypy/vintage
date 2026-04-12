import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, Modal, TextInput } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { getBalance, getTransactions, requestPayout } from '../../src/services/wallet';
import type { WalletBalance, WalletTransaction } from '../../src/services/wallet';

const TRANSACTION_ICONS: Record<string, string> = {
  sale: 'arrow-down-circle-outline',
  payout: 'arrow-up-circle-outline',
  refund: 'refresh-circle-outline',
  fee: 'remove-circle-outline',
};

const TRANSACTION_COLORS: Record<string, string> = {
  sale: colors.success[600],
  payout: colors.accent[600],
  refund: colors.primary[600],
  fee: colors.error[500],
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'Concluido',
  pending: 'Pendente',
  failed: 'Falhou',
};

type PixKeyType = 'cpf' | 'email' | 'phone' | 'random';
const PIX_KEY_TYPES: { value: PixKeyType; label: string }[] = [
  { value: 'cpf', label: 'CPF' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'random', label: 'Chave aleatoria' },
];

const formatBrl = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function WalletScreen() {
  const { theme } = useTheme();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutModalVisible, setPayoutModalVisible] = useState(false);
  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>('cpf');
  const [payoutAmount, setPayoutAmount] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [balanceData, transactionsData] = await Promise.all([
        getBalance(),
        getTransactions(),
      ]);
      setBalance(balanceData);
      setTransactions(transactionsData.items);
    } catch (_error) {
      // Keep defaults on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const openPayoutModal = () => {
    if (!balance || balance.availableBrl <= 0) {
      Alert.alert('Saldo insuficiente', 'Voce nao tem saldo disponivel para saque.');
      return;
    }
    setPayoutAmount(formatBrl(balance.availableBrl));
    setPixKey('');
    setPixKeyType('cpf');
    setPayoutModalVisible(true);
  };

  const handlePayout = async () => {
    if (!pixKey.trim()) {
      Alert.alert('Chave PIX obrigatoria', 'Informe sua chave PIX para continuar.');
      return;
    }

    const parsedAmount = parseFloat(payoutAmount.replace(/\./g, '').replace(',', '.'));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Valor invalido', 'Informe um valor valido para o saque.');
      return;
    }

    if (balance && parsedAmount > balance.availableBrl) {
      Alert.alert('Saldo insuficiente', 'O valor informado excede seu saldo disponivel.');
      return;
    }

    setPayoutLoading(true);
    try {
      await requestPayout({
        amountBrl: parsedAmount,
        pixKey: pixKey.trim(),
        pixKeyType,
      });
      setPayoutModalVisible(false);
      Alert.alert('Saque solicitado!', 'O valor sera transferido em ate 1 dia util.');
      await fetchData();
    } catch (_error) {
      Alert.alert('Erro', 'Nao foi possivel processar o saque. Tente novamente.');
    } finally {
      setPayoutLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Saldo disponivel</Text>
        <Text style={styles.balanceAmount}>
          R$ {formatBrl(balance?.availableBrl ?? 0)}
        </Text>
        {(balance?.pendingBrl ?? 0) > 0 && (
          <Text style={styles.pendingText}>
            R$ {formatBrl(balance?.pendingBrl ?? 0)} pendente
          </Text>
        )}
        <TouchableOpacity style={styles.payoutButton} onPress={openPayoutModal}>
          <Ionicons name="arrow-up-circle-outline" size={20} color={colors.neutral[0]} />
          <Text style={styles.payoutText}>Sacar via PIX</Text>
        </TouchableOpacity>
      </View>

      {/* Transactions */}
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Historico</Text>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.transactionItem, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
            <View style={[styles.transactionIcon, { backgroundColor: (TRANSACTION_COLORS[item.type] ?? colors.neutral[400]) + '15' }]}>
              <Ionicons
                name={(TRANSACTION_ICONS[item.type] ?? 'cash-outline') as any}
                size={22}
                color={TRANSACTION_COLORS[item.type] ?? colors.neutral[400]}
              />
            </View>
            <View style={styles.transactionInfo}>
              <Text style={[styles.transactionDesc, { color: theme.text }]} numberOfLines={1}>{item.description}</Text>
              <Text style={[styles.transactionMeta, { color: theme.textSecondary }]}>
                {STATUS_LABELS[item.status] ?? item.status} - {new Date(item.createdAt).toLocaleDateString('pt-BR')}
              </Text>
            </View>
            <Text style={[
              styles.transactionAmount,
              { color: item.type === 'sale' || item.type === 'refund' ? colors.success[600] : colors.error[500] },
            ]}>
              {item.type === 'sale' || item.type === 'refund' ? '+' : '-'}R$ {formatBrl(Math.abs(item.amountBrl))}
            </Text>
          </View>
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="wallet-outline" size={64} color={theme.textTertiary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Nenhuma transacao</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Seu historico de transacoes aparecera aqui.
            </Text>
          </View>
        }
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={11}
        initialNumToRender={8}
      />

      {/* Payout Modal */}
      <Modal
        visible={payoutModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPayoutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Sacar via PIX</Text>
              <TouchableOpacity onPress={() => setPayoutModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Tipo de chave PIX</Text>
            <View style={styles.pixTypeRow}>
              {PIX_KEY_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.pixTypeChip,
                    { borderColor: theme.border, backgroundColor: theme.card },
                    pixKeyType === type.value && styles.pixTypeChipActive,
                  ]}
                  onPress={() => setPixKeyType(type.value)}
                >
                  <Text style={[
                    styles.pixTypeText,
                    { color: theme.textSecondary },
                    pixKeyType === type.value && styles.pixTypeTextActive,
                  ]}>
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Chave PIX</Text>
            <TextInput
              style={[styles.textInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
              value={pixKey}
              onChangeText={setPixKey}
              placeholder="Informe sua chave PIX"
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Valor (R$)</Text>
            <TextInput
              style={[styles.textInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
              value={payoutAmount}
              onChangeText={setPayoutAmount}
              placeholder="0,00"
              placeholderTextColor={theme.textTertiary}
              keyboardType="numeric"
            />
            <Text style={[styles.availableHint, { color: theme.textTertiary }]}>
              Disponivel: R$ {formatBrl(balance?.availableBrl ?? 0)}
            </Text>

            <TouchableOpacity
              style={[styles.submitButton, payoutLoading && styles.submitDisabled]}
              onPress={handlePayout}
              disabled={payoutLoading}
            >
              {payoutLoading ? (
                <ActivityIndicator size="small" color={colors.neutral[0]} />
              ) : (
                <>
                  <Ionicons name="arrow-up-circle" size={20} color={colors.neutral[0]} />
                  <Text style={styles.submitText}>Confirmar saque</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  balanceCard: {
    backgroundColor: colors.primary[600], padding: 24, margin: 16, borderRadius: 16,
    alignItems: 'center',
  },
  balanceLabel: { fontSize: 14, color: colors.primary[200] },
  balanceAmount: { fontSize: 32, fontWeight: '700', color: colors.neutral[0], marginTop: 4 },
  pendingText: { fontSize: 13, color: colors.primary[200], marginTop: 4 },
  payoutButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.pix, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 10, marginTop: 16,
  },
  payoutText: { color: colors.neutral[0], fontSize: 15, fontWeight: '600' },
  sectionTitle: {
    fontSize: 16, fontWeight: '600',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  transactionItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  transactionIcon: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  transactionInfo: { flex: 1 },
  transactionDesc: { fontSize: 14, fontWeight: '500' },
  transactionMeta: { fontSize: 12, marginTop: 2 },
  transactionAmount: { fontSize: 15, fontWeight: '600' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptyText: { fontSize: 14, marginTop: 4 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  inputLabel: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  pixTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pixTypeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  pixTypeChipActive: { borderColor: colors.pix, backgroundColor: colors.pix + '15' },
  pixTypeText: { fontSize: 13, fontWeight: '500' },
  pixTypeTextActive: { color: colors.pix, fontWeight: '600' },
  textInput: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  availableHint: { fontSize: 12, marginTop: 4 },
  submitButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.pix, paddingVertical: 14, borderRadius: 10,
    marginTop: 24,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: colors.neutral[0], fontSize: 16, fontWeight: '600' },
});
