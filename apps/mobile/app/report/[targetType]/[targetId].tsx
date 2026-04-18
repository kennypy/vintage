import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/contexts/ThemeContext';
import { createReport } from '../../../src/services/moderation';
import type {
  ReportTargetType, ReportReason,
} from '../../../src/services/moderation';
import { ApiError } from '../../../src/services/api';

// Mirror the server enum exactly (apps/api/src/reports/dto/create-report.dto.ts).
// Label is what the user sees in Portuguese.
const REASONS: ReadonlyArray<{ value: ReportReason; label: string; help: string }> = [
  { value: 'spam',          label: 'Spam',                    help: 'Conteúdo repetitivo, propaganda ou links suspeitos.' },
  { value: 'counterfeit',   label: 'Produto falso',            help: 'Anúncio de item replicado vendido como autêntico.' },
  { value: 'inappropriate', label: 'Conteúdo inapropriado',    help: 'Violência, nudez, discurso de ódio.' },
  { value: 'fraud',         label: 'Fraude ou golpe',          help: 'Tentativa de pagamento fora da plataforma, phishing.' },
  { value: 'harassment',    label: 'Assédio ou ameaças',       help: 'Mensagens hostis, stalking, intimidação.' },
  { value: 'other',         label: 'Outro motivo',             help: 'Descreva nos detalhes abaixo.' },
];

const ALLOWED_TYPES: ReadonlyArray<ReportTargetType> = ['listing', 'message', 'user', 'review'];

export default function ReportScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ targetType: string; targetId: string }>();

  const targetType = (ALLOWED_TYPES.includes(params.targetType as ReportTargetType)
    ? (params.targetType as ReportTargetType)
    : 'user') as ReportTargetType;
  const targetId = params.targetId ?? '';

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason) {
      Alert.alert('Motivo obrigatório', 'Selecione um motivo antes de enviar.');
      return;
    }
    setSubmitting(true);
    try {
      await createReport({ targetType, targetId, reason, description: description.trim() || undefined });
      Alert.alert(
        'Denúncia recebida',
        'Obrigado. Nossa equipe analisará em até 48h.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : 'Não foi possível enviar a denúncia.';
      Alert.alert('Erro', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: 'Denunciar' }} />

        <Text style={[styles.help, { color: theme.textSecondary }]}>
          Denúncias são revisadas pela nossa equipe de moderação. O autor do
          conteúdo não é avisado de quem denunciou.
        </Text>

        <Text style={[styles.label, { color: theme.textSecondary }]}>Motivo</Text>
        {REASONS.map((r) => (
          <TouchableOpacity
            key={r.value}
            style={[
              styles.reason,
              {
                backgroundColor: theme.card,
                borderColor: reason === r.value ? colors.primary[500] : theme.border,
              },
            ]}
            onPress={() => setReason(r.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: reason === r.value }}
          >
            <Ionicons
              name={reason === r.value ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={reason === r.value ? colors.primary[500] : theme.textTertiary}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.reasonLabel, { color: theme.text }]}>{r.label}</Text>
              <Text style={[styles.reasonHelp, { color: theme.textTertiary }]}>{r.help}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <Text style={[styles.label, { color: theme.textSecondary, marginTop: 18 }]}>
          Detalhes (opcional)
        </Text>
        <TextInput
          style={[styles.textArea, {
            color: theme.text,
            borderColor: theme.border,
            backgroundColor: theme.inputBg,
          }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Links, capturas de tela, contexto adicional…"
          placeholderTextColor={theme.textTertiary}
          multiline
          maxLength={500}
          accessibilityLabel="Descrição"
        />
        <Text style={[styles.counter, { color: theme.textTertiary }]}>
          {description.length}/500
        </Text>

        <TouchableOpacity
          style={[
            styles.primary,
            { backgroundColor: colors.primary[500] },
            (submitting || !reason) && styles.primaryDisabled,
          ]}
          onPress={handleSubmit}
          disabled={submitting || !reason}
          accessibilityRole="button"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Enviar denúncia</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 6 },
  help: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  label: {
    fontSize: 12, fontWeight: '600', textTransform: 'uppercase',
    marginBottom: 6,
  },
  reason: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  reasonLabel: { fontSize: 15, fontWeight: '600' },
  reasonHelp: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  textArea: {
    borderWidth: 1, borderRadius: 10,
    padding: 12, fontSize: 14, minHeight: 100, textAlignVertical: 'top',
  },
  counter: { fontSize: 11, textAlign: 'right', marginTop: 4 },
  primary: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    marginTop: 18,
  },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
