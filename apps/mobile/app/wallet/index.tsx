import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
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
  completed: 'Concluído',
  pending: 'Pendente',
  failed: 'Falhou',
};

const formatBrl = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function WalletScreen() {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);

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

  const handlePayout = () => {
    if (!balance || balance.availableBrl <= 0) {
      Alert.alert('Saldo insuficiente', 'Você não tem saldo disponível para saque.');
      return;
    }

    Alert.alert(
      'Sacar via PIX',
      `Sacar R$ ${formatBrl(balance.availableBrl)} para sua chave PIX cadastrada?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sacar',
          onPress: async () => {
            setPayoutLoading(true);
            try {
              await requestPayout({
                amountBrl: balance.availableBrl,
                pixKey: '',
                pixKeyType: 'cpf',
              });
              Alert.alert('Saque solicitado!', 'O valor será transferido em até 1 dia útil.');
              await fetchData();
            } catch (_error) {
              Alert.alert('Erro', 'Não foi possível processar o saque. Tente novamente.');
            } finally {
              setPayoutLoading(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Saldo disponível</Text>
        <Text style={styles.balanceAmount}>
          R$ {formatBrl(balance?.availableBrl ?? 0)}
        </Text>
        {(balance?.pendingBrl ?? 0) > 0 && (
          <Text style={styles.pendingText}>
            R$ {formatBrl(balance?.pendingBrl ?? 0)} pendente
          </Text>
        )}
        <TouchableOpacity
          style={[styles.payoutButton, payoutLoading && styles.payoutDisabled]}
          onPress={handlePayout}
          disabled={payoutLoading}
        >
          <Ionicons name="arrow-up-circle-outline" size={20} color={colors.neutral[0]} />
          <Text style={styles.payoutText}>
            {payoutLoading ? 'Processando...' : 'Sacar via PIX'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Transactions */}
      <Text style={styles.sectionTitle}>Histórico</Text>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.transactionItem}>
            <View style={[styles.transactionIcon, { backgroundColor: (TRANSACTION_COLORS[item.type] ?? colors.neutral[400]) + '15' }]}>
              <Ionicons
                name={(TRANSACTION_ICONS[item.type] ?? 'cash-outline') as any}
                size={22}
                color={TRANSACTION_COLORS[item.type] ?? colors.neutral[400]}
              />
            </View>
            <View style={styles.transactionInfo}>
              <Text style={styles.transactionDesc} numberOfLines={1}>{item.description}</Text>
              <Text style={styles.transactionMeta}>
                {STATUS_LABELS[item.status] ?? item.status} - {new Date(item.createdAt).toLocaleDateString('pt-BR')}
              </Text>
            </View>
            <Text style={[
              styles.transactionAmount,
              { color: item.type === 'sale' || item.type === 'refund' ? colors.success[600] : colors.neutral[800] },
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
            <Ionicons name="wallet-outline" size={64} color={colors.neutral[300]} />
            <Text style={styles.emptyTitle}>Nenhuma transação</Text>
            <Text style={styles.emptyText}>
              Seu histórico de transações aparecerá aqui.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
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
  payoutDisabled: { opacity: 0.6 },
  payoutText: { color: colors.neutral[0], fontSize: 15, fontWeight: '600' },
  sectionTitle: {
    fontSize: 16, fontWeight: '600', color: colors.neutral[900],
    paddingHorizontal: 16, paddingVertical: 12,
  },
  transactionItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    backgroundColor: colors.neutral[0],
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.neutral[200],
  },
  transactionIcon: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  transactionInfo: { flex: 1 },
  transactionDesc: { fontSize: 14, fontWeight: '500', color: colors.neutral[800] },
  transactionMeta: { fontSize: 12, color: colors.neutral[400], marginTop: 2 },
  transactionAmount: { fontSize: 15, fontWeight: '600' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.neutral[900], marginTop: 16 },
  emptyText: { fontSize: 14, color: colors.neutral[400], marginTop: 4 },
});
