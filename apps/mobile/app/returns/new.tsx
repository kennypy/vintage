import { Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { createReturn, type DisputeReason } from '../../src/services/returns';

const REASONS: { value: DisputeReason; label: string }[] = [
  { value: 'NOT_AS_DESCRIBED', label: 'Não corresponde ao anúncio' },
  { value: 'DAMAGED', label: 'Item danificado' },
  { value: 'COUNTERFEIT', label: 'Item falsificado' },
  { value: 'NOT_RECEIVED', label: 'Não recebi o item' },
  { value: 'WRONG_ITEM', label: 'Item errado' },
];

export default function NewReturnScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const [reason, setReason] = useState<DisputeReason>('NOT_AS_DESCRIBED');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!orderId) return;
    if (description.trim().length < 10) {
      Alert.alert('Descrição', 'Forneça ao menos 10 caracteres descrevendo o problema.');
      return;
    }
    setSubmitting(true);
    try {
      const ret = await createReturn(orderId, reason, description.trim());
      router.replace(`/returns/${ret.id}`);
    } catch (err) {
      Alert.alert('Erro', String(err).slice(0, 200));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Solicitar devolução</Text>
      <Text style={styles.label}>Motivo</Text>
      {REASONS.map((r) => (
        <TouchableOpacity
          key={r.value}
          style={[styles.option, reason === r.value && styles.optionActive]}
          onPress={() => setReason(r.value)}
        >
          <Text style={reason === r.value ? styles.optionTextActive : styles.optionText}>{r.label}</Text>
        </TouchableOpacity>
      ))}
      <Text style={styles.label}>Descrição detalhada</Text>
      <TextInput
        style={styles.input}
        multiline
        numberOfLines={5}
        placeholder="Descreva o problema com ao menos 10 caracteres"
        value={description}
        onChangeText={setDescription}
      />
      <TouchableOpacity style={styles.button} onPress={submit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Enviar solicitação</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.neutral[50] },
  title: { fontSize: 22, fontWeight: '700', color: colors.neutral[900], marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: colors.neutral[700], marginTop: 16, marginBottom: 8 },
  option: { padding: 12, borderRadius: 8, backgroundColor: colors.neutral[0], marginBottom: 8 },
  optionActive: { backgroundColor: colors.primary[500] },
  optionText: { color: colors.neutral[900] },
  optionTextActive: { color: '#fff', fontWeight: '600' },
  input: { backgroundColor: colors.neutral[0], padding: 12, borderRadius: 8, minHeight: 100, textAlignVertical: 'top' },
  button: { backgroundColor: colors.primary[500], padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 24 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
