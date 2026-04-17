import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, Modal, TextInput } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import {
  getBalance, getTransactions, requestPayout, listPayoutMethods,
} from '../../src/services/wallet';
import type { WalletBalance, WalletTransaction, PayoutMethodView, PixKeyType } from '../../src/services/wallet';
import { ApiError } from '../../src/services/api';

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

const TYPE_LABELS: Record<PixKeyType, string> = {
  PIX_CPF: 'CPF',
  PIX_CNPJ: 'CNPJ',
  PIX_EMAIL: 'E-mail',
  PIX_PHONE: 'Telefone',
  PIX_RANDOM: 'Aleatória',
};

const formatBrl = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function WalletScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [methods, setMethods] = useState<PayoutMethodView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutModalVisible, setPayoutModalVisible] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [payoutAmount, setPayoutAmount] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [balanceData, transactionsData, methodsData] = await Promise.all([
        getBalance(),
        getTransactions(),
        listPayoutMethods().catch(() => [] as PayoutMethodView[]),
      ]);
      setBalance(balanceData);
      setTransactions(transactionsData.items);
      setMethods(methodsData);
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
    if (methods.length === 0) {
      Alert.alert(
        'Cadastre uma chave PIX',
        'Você precisa cadastrar pelo menos uma chave PIX antes de sacar.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Cadastrar agora', onPress: () => router.push('/conta/payout-methods') },
        ],
      );
      return;
    }
    setPayoutAmount(formatBrl(balance.availableBrl));
    // Pre-select the default method if any, else the most recent.
    const def = methods.find((m) => m.isDefault) ?? methods[0];
    setSelectedMethodId(def.id);
    setPayoutModalVisible(true);
  };

  const handlePayout = async () => {
    if (!selectedMethodId) {
      Alert.alert('Selecione uma chave', 'Escolha para qual chave PIX enviar.');
      return;
    }
    const parsedAmount = parseFloat(payoutAmount.replace(/\./g, '').replace(',', '.'));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor válido para o saque.');
      return;
    }
    if (balance && parsedAmount > balance.availableBrl) {
      Alert.alert('Saldo insuficiente', 'O valor informado excede seu saldo disponível.');
      return;
    }

    setPayoutLoading(true);
    try {
      await requestPayout({ amountBrl: parsedAmount, payoutMethodId: selectedMethodId });
      setPayoutModalVisible(false);
      Alert.alert('Saque solicitado!', 'O valor será transferido em até 1 dia útil.');
      await fetchData();
    } catch (err) {
      const msg = err instanceof ApiError && err.message
        ? err.message
        : 'Não foi possível processar o saque. Tente novamente.';
      Alert.alert('Erro', msg);
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
        <TouchableOpacity
          style={styles.manageKeysLink}
          onPress={() => router.push('/conta/payout-methods')}
          accessibilityRole="button"
        >
          <Text style={styles.manageKeysLinkText}>Gerenciar chaves PIX</Text>
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

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
              Destino ({methods.length} chave{methods.length !== 1 ? 's' : ''} cadastrada{methods.length !== 1 ? 's' : ''})
            </Text>
            {methods.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[
                  styles.methodRow,
                  { borderColor: selectedMethodId === m.id ? colors.primary[500] : theme.border },
                ]}
                onPress={() => setSelectedMethodId(m.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: selectedMethodId === m.id }}
              >
                <Ionicons
                  name={selectedMethodId === m.id ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={selectedMethodId === m.id ? colors.primary[500] : theme.textTertiary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.methodType, { color: theme.textSecondary }]}>
                    {TYPE_LABELS[m.type]}{m.isDefault ? ' · padrão' : ''}
                  </Text>
                  <Text style={[styles.methodKey, { color: theme.text }]}>{m.pixKeyMasked}</Text>
                </View>
              </TouchableOpacity>
            ))}

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
  manageKeysLink: { marginTop: 10 },
  manageKeysLinkText: { color: colors.primary[100], fontSize: 13, textDecorationLine: 'underline' },
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
  inputLabel: { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 8, textTransform: 'uppercase' },
  methodRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
  },
  methodType: { fontSize: 12, textTransform: 'uppercase', fontWeight: '600' },
  methodKey: { fontSize: 15, fontFamily: 'monospace', marginTop: 2 },
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
