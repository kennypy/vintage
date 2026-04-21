import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { retryPayment, type RetryPaymentMethod } from '../../src/services/orders';

const METHODS: { value: RetryPaymentMethod; label: string }[] = [
  { value: 'PIX', label: 'PIX' },
  { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
  { value: 'BOLETO', label: 'Boleto' },
];

export default function RetryPaymentScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const id = orderId;
  const router = useRouter();
  const [method, setMethod] = useState<RetryPaymentMethod>('PIX');
  const [installments] = useState<number>(1);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await retryPayment(id, method, method === 'CREDIT_CARD' ? installments : undefined);
      Alert.alert('Nova tentativa criada', 'Siga para finalizar o pagamento.');
      router.replace(`/orders/${id}`);
    } catch (err) {
      Alert.alert('Erro', String(err).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Retentar pagamento</Text>
      <Text style={styles.sub}>Escolha o método para uma nova tentativa.</Text>
      {METHODS.map((m) => (
        <TouchableOpacity
          key={m.value}
          style={[styles.opt, method === m.value && styles.optActive]}
          onPress={() => setMethod(m.value)}
        >
          <Text style={method === m.value ? styles.optTextActive : styles.optText}>{m.label}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.primary} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Criar nova tentativa</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.neutral[50] },
  title: { fontSize: 22, fontWeight: '700', color: colors.neutral[900] },
  sub: { color: colors.neutral[600], marginTop: 4, marginBottom: 16 },
  opt: { padding: 14, borderRadius: 8, backgroundColor: colors.neutral[0], marginBottom: 8 },
  optActive: { backgroundColor: colors.primary[500] },
  optText: { color: colors.neutral[900] },
  optTextActive: { color: '#fff', fontWeight: '600' },
  primary: { backgroundColor: colors.primary[500], padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 24 },
  primaryText: { color: '#fff', fontWeight: '700' },
});
