import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  getOfferThread,
  counterOffer,
  acceptOffer,
  rejectOffer,
  type Offer,
} from '../../src/services/offers';

export default function OfferThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [thread, setThread] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');

  const refresh = async () => {
    if (!id) return;
    setLoading(true);
    try {
      setThread(await getOfferThread(id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [id]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (thread.length === 0) return <Text style={styles.empty}>Oferta não encontrada.</Text>;

  const latest = thread[thread.length - 1];
  const canAct =
    latest.status === 'PENDING' &&
    latest.counteredById !== user?.id;

  const doAction = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      Alert.alert('OK', msg);
      await refresh();
    } catch (err) {
      Alert.alert('Erro', String(err).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Negociação</Text>
      {thread.map((o, i) => (
        <View key={o.id} style={[styles.bubble, o.counteredById === user?.id ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={styles.bubbleAmount}>R$ {Number(o.amountBrl).toFixed(2)}</Text>
          <Text style={styles.bubbleMeta}>
            {o.counteredById === user?.id ? 'Você' : 'Outra parte'} · {o.status} · rodada {i + 1}
          </Text>
        </View>
      ))}
      {canAct && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primary}
            disabled={busy}
            onPress={() => doAction(() => acceptOffer(latest.id), 'Oferta aceita!')}
          >
            <Text style={styles.primaryText}>Aceitar R$ {Number(latest.amountBrl).toFixed(2)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.danger}
            disabled={busy}
            onPress={() => doAction(() => rejectOffer(latest.id), 'Oferta recusada.')}
          >
            <Text style={styles.dangerText}>Recusar</Text>
          </TouchableOpacity>
          <Text style={styles.label}>Contrapropor:</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="R$ 0,00"
            value={counterAmount}
            onChangeText={setCounterAmount}
          />
          <TouchableOpacity
            style={styles.secondary}
            disabled={busy}
            onPress={() => {
              const amt = Number(counterAmount.replace(',', '.'));
              if (!amt || amt <= 0) {
                Alert.alert('Valor', 'Informe um valor válido');
                return;
              }
              doAction(() => counterOffer(latest.id, amt), 'Contraproposta enviada.');
            }}
          >
            <Text style={styles.secondaryText}>Enviar contraproposta</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.neutral[50] },
  title: { fontSize: 22, fontWeight: '700', color: colors.neutral[900], marginBottom: 16 },
  bubble: { padding: 12, borderRadius: 12, marginBottom: 8, maxWidth: '80%' },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: colors.primary[500] },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: colors.neutral[0] },
  bubbleAmount: { fontWeight: '700', color: colors.neutral[900] },
  bubbleMeta: { fontSize: 11, color: colors.neutral[600], marginTop: 2 },
  actions: { marginTop: 24 },
  label: { fontWeight: '600', color: colors.neutral[700], marginTop: 16, marginBottom: 4 },
  input: { backgroundColor: colors.neutral[0], padding: 12, borderRadius: 8 },
  primary: { backgroundColor: colors.primary[500], padding: 14, borderRadius: 8, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700' },
  danger: { backgroundColor: colors.error[500], padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  dangerText: { color: '#fff', fontWeight: '700' },
  secondary: { backgroundColor: colors.accent[500], padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  secondaryText: { color: '#fff', fontWeight: '700' },
  empty: { textAlign: 'center', color: colors.neutral[500], marginTop: 40 },
});
