import { Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Linking } from 'react-native';
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  getReturn,
  approveReturn,
  rejectReturn,
  markReturnShipped,
  inspectApprove,
  inspectReject,
  type Return,
} from '../../src/services/returns';

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Solicitada',
  APPROVED: 'Aprovada',
  REJECTED: 'Recusada',
  SHIPPED: 'Enviada',
  RECEIVED: 'Recebida',
  REFUNDED: 'Reembolsada',
  DISPUTED: 'Em disputa',
};

export default function ReturnDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [ret, setRet] = useState<Return | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!id) return;
    setLoading(true);
    try {
      setRet(await getReturn(id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [id]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (!ret) return <Text style={styles.empty}>Devolução não encontrada.</Text>;

  const isBuyer = user?.id === ret.order?.buyer.id;
  const isSeller = user?.id === ret.order?.seller.id;

  const doAction = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      Alert.alert('Sucesso', ok);
      await refresh();
    } catch (err) {
      Alert.alert('Erro', String(err).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{ret.order?.listing.title ?? 'Devolução'}</Text>
      <Text style={styles.status}>{STATUS_LABELS[ret.status]}</Text>
      <Text style={styles.label}>Motivo:</Text>
      <Text style={styles.value}>{ret.reason}</Text>
      <Text style={styles.label}>Descrição:</Text>
      <Text style={styles.value}>{ret.description}</Text>
      {ret.returnTrackingCode && (
        <>
          <Text style={styles.label}>Código de rastreio:</Text>
          <Text style={styles.value}>{ret.returnTrackingCode}</Text>
        </>
      )}
      {ret.returnLabelUrl && (
        <TouchableOpacity
          style={styles.secondary}
          onPress={() => Linking.openURL(ret.returnLabelUrl!)}
        >
          <Text style={styles.secondaryText}>Abrir etiqueta de retorno</Text>
        </TouchableOpacity>
      )}

      {/* Seller actions */}
      {isSeller && ret.status === 'REQUESTED' && (
        <>
          <TouchableOpacity
            style={styles.primary}
            disabled={busy}
            onPress={() => doAction(() => approveReturn(ret.id), 'Devolução aprovada. Etiqueta gerada.')}
          >
            <Text style={styles.primaryText}>Aprovar devolução</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.danger}
            disabled={busy}
            onPress={() =>
              Alert.prompt?.('Recusar devolução', 'Motivo da recusa (escalará para disputa):', (reason) => {
                if (reason && reason.length >= 10) {
                  doAction(() => rejectReturn(ret.id, reason), 'Devolução recusada — disputa criada.');
                }
              })
            }
          >
            <Text style={styles.dangerText}>Recusar devolução</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Buyer action after approval */}
      {isBuyer && ret.status === 'APPROVED' && (
        <TouchableOpacity
          style={styles.primary}
          disabled={busy}
          onPress={() => doAction(() => markReturnShipped(ret.id), 'Marcado como enviado.')}
        >
          <Text style={styles.primaryText}>Marcar como enviado</Text>
        </TouchableOpacity>
      )}

      {/* Seller inspection */}
      {isSeller && ret.status === 'RECEIVED' && (
        <>
          <TouchableOpacity
            style={styles.primary}
            disabled={busy}
            onPress={() => doAction(() => inspectApprove(ret.id), 'Reembolso processado.')}
          >
            <Text style={styles.primaryText}>Aprovar reembolso</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.danger}
            disabled={busy}
            onPress={() =>
              Alert.prompt?.('Rejeitar inspeção', 'Motivo (escalará para disputa):', (reason) => {
                if (reason && reason.length >= 10) {
                  doAction(() => inspectReject(ret.id, reason), 'Inspeção rejeitada — disputa criada.');
                }
              })
            }
          >
            <Text style={styles.dangerText}>Rejeitar após inspeção</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.neutral[50] },
  title: { fontSize: 22, fontWeight: '700', color: colors.neutral[900] },
  status: { color: colors.primary[600], fontWeight: '600', marginTop: 4, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.neutral[600], marginTop: 12 },
  value: { color: colors.neutral[900], marginTop: 2 },
  primary: { backgroundColor: colors.primary[500], padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  primaryText: { color: '#fff', fontWeight: '700' },
  danger: { backgroundColor: colors.error[500], padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  dangerText: { color: '#fff', fontWeight: '700' },
  secondary: { padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: colors.primary[500] },
  secondaryText: { color: colors.primary[600], fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.neutral[500], marginTop: 40 },
});
