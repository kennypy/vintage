import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { colors } from '../../src/theme/colors';
import {
  getTicket,
  replyToTicket,
  type TicketDetail,
} from '../../src/services/support';

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em andamento',
  RESOLVED: 'Resolvido',
  CLOSED: 'Fechado',
};

const CATEGORY_LABELS: Record<string, string> = {
  ORDER_ISSUE: 'Problema com pedido',
  PAYMENT: 'Pagamento',
  SHIPPING: 'Envio',
  REFUND: 'Reembolso',
  ACCOUNT: 'Conta',
  LISTING: 'Anúncio',
  FRAUD: 'Fraude',
  OTHER: 'Outro',
};

export default function SupportTicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setTicket(await getTicket(id));
    } catch {
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    if (!id || !reply.trim()) return;
    setSending(true);
    try {
      await replyToTicket(id, reply.trim());
      setReply('');
      await load();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    } catch (e) {
      Alert.alert('Erro', String(e).slice(0, 200));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary[500]} />;
  if (!ticket) return <Text style={styles.empty}>Ticket não encontrado.</Text>;

  const closed = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.subject}>{ticket.subject}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.status}>{STATUS_LABELS[ticket.status] ?? ticket.status}</Text>
          <Text style={styles.meta}>
            {CATEGORY_LABELS[ticket.category] ?? ticket.category} ·{' '}
            {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
          </Text>
        </View>

        <View style={[styles.bubble, styles.bubbleUser]}>
          <Text style={styles.bubbleRole}>Você</Text>
          <Text style={styles.bubbleBody}>{ticket.body}</Text>
        </View>

        {ticket.messages.map((m) => {
          const agentLabel =
            m.senderRole === 'agent'
              ? m.senderDisplayName
                ? `${m.senderDisplayName} · Suporte Vintage`
                : 'Suporte Vintage'
              : 'Você';
          const attachments = m.attachmentUrls ?? [];
          return (
            <View
              key={m.id}
              style={[styles.bubble, m.senderRole === 'agent' ? styles.bubbleAgent : styles.bubbleUser]}
            >
              <Text style={styles.bubbleRole}>{agentLabel}</Text>
              <Text style={styles.bubbleBody}>{m.body}</Text>
              {attachments.length > 0 && (
                <View style={styles.attachmentsRow}>
                  {attachments.map((url) => {
                    const isImage = /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url);
                    return (
                      <TouchableOpacity key={url} onPress={() => Linking.openURL(url)}>
                        {isImage ? (
                          <Image source={{ uri: url }} style={styles.attachmentImg} />
                        ) : (
                          <View style={styles.attachmentFile}>
                            <Text style={styles.attachmentFileText} numberOfLines={1}>
                              📎 Anexo
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              <Text style={styles.bubbleTime}>
                {new Date(m.createdAt).toLocaleString('pt-BR')}
              </Text>
            </View>
          );
        })}

        {closed && (
          <Text style={styles.resolved}>
            Este ticket foi {ticket.status === 'RESOLVED' ? 'resolvido' : 'fechado'}. Se o problema
            persistir, envie uma nova mensagem para reabrir.
          </Text>
        )}
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Escreva uma resposta…"
          placeholderTextColor={colors.neutral[400]}
          value={reply}
          onChangeText={setReply}
          multiline
          maxLength={5000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (sending || !reply.trim()) && { opacity: 0.5 }]}
          disabled={sending || !reply.trim()}
          onPress={send}
        >
          <Text style={styles.sendText}>Enviar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  empty: { textAlign: 'center', padding: 32, color: colors.neutral[500] },
  subject: { fontSize: 20, fontWeight: '700', color: colors.neutral[900] },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 16 },
  status: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary[700],
    backgroundColor: colors.primary[100],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  meta: { fontSize: 12, color: colors.neutral[500] },
  bubble: { borderRadius: 12, padding: 12, marginBottom: 8, maxWidth: '90%' },
  bubbleUser: {
    backgroundColor: colors.neutral[0],
    alignSelf: 'flex-end',
    borderTopRightRadius: 4,
  },
  bubbleAgent: {
    backgroundColor: colors.primary[50],
    alignSelf: 'flex-start',
    borderTopLeftRadius: 4,
  },
  bubbleRole: { fontSize: 11, fontWeight: '700', color: colors.neutral[500], marginBottom: 4 },
  bubbleBody: { fontSize: 14, color: colors.neutral[900], lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: colors.neutral[400], marginTop: 6 },
  attachmentsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  attachmentImg: {
    width: 72,
    height: 72,
    borderRadius: 6,
    backgroundColor: colors.neutral[200],
  },
  attachmentFile: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: colors.neutral[100],
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  attachmentFileText: { fontSize: 12, color: colors.neutral[700], maxWidth: 120 },
  resolved: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.neutral[100],
    color: colors.neutral[600],
    fontSize: 13,
    textAlign: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: colors.neutral[0],
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 14,
    color: colors.neutral[900],
  },
  sendBtn: {
    backgroundColor: colors.primary[600],
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  sendText: { color: '#fff', fontWeight: '700' },
});
