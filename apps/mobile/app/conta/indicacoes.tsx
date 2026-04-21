import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Share } from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { colors } from '../../src/theme/colors';
import { getMyReferrals, type MyReferrals } from '../../src/services/referrals';

const formatBrl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReferralsScreen() {
  const [data, setData] = useState<MyReferrals | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getMyReferrals());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!data) return <Text style={styles.empty}>Não foi possível carregar suas indicações.</Text>;

  const shareMessage = `Use meu código de indicação ${data.code} para ganhar R$ ${formatBrl(data.rewardAmountBrl)} na sua primeira compra no Vintage.br.`;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(data.code);
    Alert.alert('Copiado!', 'Código copiado para a área de transferência.');
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: shareMessage });
    } catch {
      // cancelled
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Convide amigas, ganhe R$ {formatBrl(data.rewardAmountBrl)}</Text>
      <Text style={styles.subtitle}>
        Vocês duas ganham R$ {formatBrl(data.rewardAmountBrl)} de crédito quando a sua convidada faz a primeira compra.
      </Text>

      <View style={styles.codeBox}>
        <Text style={styles.codeLabel}>Seu código</Text>
        <Text style={styles.code}>{data.code}</Text>
        <View style={styles.codeActions}>
          <TouchableOpacity style={styles.btnGhost} onPress={handleCopy}>
            <Ionicons name="copy-outline" size={16} color={colors.primary[600]} />
            <Text style={styles.btnGhostText}>Copiar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={handleShare}>
            <Ionicons name="share-outline" size={16} color="#fff" />
            <Text style={styles.btnPrimaryText}>Compartilhar</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statsRow}>
        <Stat label="Convidadas" value={data.totalInvited.toString()} />
        <Stat label="Recompensadas" value={data.totalRewarded.toString()} />
        <Stat label="Ganhos" value={`R$ ${formatBrl(data.totalRewardsBrl)}`} />
      </View>

      <Text style={styles.sectionTitle}>Histórico</Text>
      {data.referrals.length === 0 ? (
        <Text style={styles.empty}>Você ainda não convidou ninguém.</Text>
      ) : (
        data.referrals.map((r) => (
          <View key={r.id} style={styles.row}>
            <Text style={styles.rowName}>{r.refereeName}</Text>
            <Text style={r.rewardedAt ? styles.rowRewarded : styles.rowPending}>
              {r.rewardedAt ? `✓ R$ ${formatBrl(data.rewardAmountBrl)}` : 'Pendente'}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  title: { fontSize: 22, fontWeight: '700', color: colors.neutral[900], marginBottom: 4 },
  subtitle: { fontSize: 14, color: colors.neutral[600], marginBottom: 24 },
  codeBox: {
    backgroundColor: colors.neutral[0],
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  codeLabel: { color: colors.neutral[500], fontSize: 12, marginBottom: 4 },
  code: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary[600],
    letterSpacing: 2,
    marginBottom: 16,
  },
  codeActions: { flexDirection: 'row', gap: 12 },
  btnGhost: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8,
    borderWidth: 1, borderColor: colors.primary[600],
  },
  btnGhostText: { color: colors.primary[600], fontWeight: '600' },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8,
    backgroundColor: colors.primary[600],
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  statBox: {
    flex: 1,
    backgroundColor: colors.neutral[0],
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.neutral[900] },
  statLabel: { fontSize: 11, color: colors.neutral[500], marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.neutral[800], marginBottom: 8 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.neutral[200],
  },
  rowName: { color: colors.neutral[900] },
  rowRewarded: { color: colors.success[600], fontWeight: '600' },
  rowPending: { color: colors.neutral[500] },
  empty: { textAlign: 'center', color: colors.neutral[500], marginTop: 20 },
});
