import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../../src/theme/colors';
import { apiFetch } from '../../src/services/api';

interface Ticket {
  id: string;
  subject: string;
  status: string;
  category: string;
  createdAt: string;
}

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'ORDER_ISSUE', label: 'Problema com pedido' },
  { value: 'PAYMENT', label: 'Pagamento' },
  { value: 'SHIPPING', label: 'Envio' },
  { value: 'REFUND', label: 'Reembolso' },
  { value: 'ACCOUNT', label: 'Conta' },
  { value: 'LISTING', label: 'Anúncio' },
  { value: 'FRAUD', label: 'Fraude' },
  { value: 'OTHER', label: 'Outro' },
];

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em andamento',
  RESOLVED: 'Resolvido',
  CLOSED: 'Fechado',
};

export default function SupportScreen() {
  const [items, setItems] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('OTHER');
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: Ticket[] }>('/support/tickets');
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = async () => {
    if (subject.trim().length < 3 || body.trim().length < 10) {
      Alert.alert('Campos obrigatórios', 'Preencha assunto e descrição.');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/support/tickets', {
        method: 'POST',
        body: JSON.stringify({ subject: subject.trim(), body: body.trim(), category }),
      });
      setSubject('');
      setBody('');
      setCategory('OTHER');
      await refresh();
      Alert.alert('Ticket aberto', 'Responderemos em breve.');
    } catch (err) {
      Alert.alert('Erro', String(err).slice(0, 200));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Suporte</Text>
      <Text style={styles.subtitle}>Fale com a nossa equipe. Resposta em até 1 dia útil.</Text>

      <View style={styles.card}>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.value}
              style={[
                styles.categoryChip,
                category === c.value && styles.categoryChipActive,
              ]}
              onPress={() => setCategory(c.value)}
            >
              <Text style={category === c.value ? styles.categoryChipTextActive : styles.categoryChipText}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder="Assunto"
          value={subject}
          onChangeText={setSubject}
          maxLength={200}
        />
        <TextInput
          style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
          placeholder="Descreva o problema (número do pedido, datas, etc)"
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={5000}
        />
        <TouchableOpacity style={styles.submit} onPress={submit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Abrir ticket</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Meus tickets</Text>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>Nenhum ticket aberto.</Text>
      ) : (
        items.map((t) => (
          <View key={t.id} style={styles.ticketCard}>
            <View style={styles.ticketHeader}>
              <Text style={styles.ticketSubject}>{t.subject}</Text>
              <Text style={styles.ticketStatus}>{STATUS_LABELS[t.status] ?? t.status}</Text>
            </View>
            <Text style={styles.ticketMeta}>
              {CATEGORIES.find((c) => c.value === t.category)?.label ?? t.category} ·{' '}
              {new Date(t.createdAt).toLocaleDateString('pt-BR')}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  title: { fontSize: 24, fontWeight: '700', color: colors.neutral[900] },
  subtitle: { color: colors.neutral[600], marginTop: 4, marginBottom: 20 },
  card: { backgroundColor: colors.neutral[0], padding: 14, borderRadius: 12, marginBottom: 24 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  categoryChip: {
    paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 16, backgroundColor: colors.neutral[100],
  },
  categoryChipActive: { backgroundColor: colors.primary[600] },
  categoryChipText: { fontSize: 12, color: colors.neutral[700] },
  categoryChipTextActive: { fontSize: 12, color: '#fff', fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: colors.neutral[300],
    borderRadius: 8, padding: 12, marginBottom: 10,
  },
  submit: {
    backgroundColor: colors.primary[600],
    padding: 14, borderRadius: 10, alignItems: 'center',
  },
  submitText: { color: '#fff', fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.neutral[800], marginBottom: 10 },
  empty: { color: colors.neutral[500] },
  ticketCard: { backgroundColor: colors.neutral[0], padding: 12, borderRadius: 10, marginBottom: 8 },
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ticketSubject: { fontWeight: '600', color: colors.neutral[900], flex: 1 },
  ticketStatus: { fontSize: 12, color: colors.primary[600] },
  ticketMeta: { fontSize: 11, color: colors.neutral[500], marginTop: 4 },
});
