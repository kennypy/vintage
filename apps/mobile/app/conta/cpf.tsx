import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { getProfile, setCpf as setCpfService } from '../../src/services/users';
import { ApiError } from '../../src/services/api';

// Mask 52998224725 → 529.982.247-25 as the user types. We only format for
// display; on submit we send the value as-is and let the server canonicalise.
function formatCpfInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  const parts = [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 9),
    digits.slice(9, 11),
  ].filter(Boolean);
  if (parts.length <= 3) return parts.join('.');
  return `${parts.slice(0, 3).join('.')}-${parts[3]}`;
}

// "529.982.247-25" → "•••.•••.•••-25" for display after it's set.
function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return '•••';
  return `•••.•••.•••-${digits.slice(-2)}`;
}

export default function CpfScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { refreshUser, user: authUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingCpf, setExistingCpf] = useState<string | null>(null);
  const [cpfVerified, setCpfVerified] = useState(false);
  const [input, setInput] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await getProfile();
        if (cancelled) return;
        setExistingCpf(profile.cpf ?? null);
        setCpfVerified(!!profile.cpfVerified);
      } catch (_err) {
        // Fall back to the auth context if /users/me isn't reachable (demo
        // mode, offline). The auth user carries the seed CPF for those cases.
        if (!cancelled && authUser && 'cpf' in authUser) {
          const raw = (authUser as { cpf?: string | null }).cpf;
          setExistingCpf(raw ?? null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authUser]);

  const handleSubmit = async () => {
    const digits = input.replace(/\D/g, '');
    if (digits.length !== 11) {
      Alert.alert('CPF inválido', 'Informe os 11 dígitos do CPF.');
      return;
    }
    setSubmitting(true);
    try {
      await setCpfService(input);
      await refreshUser();
      setExistingCpf(digits);
      setCpfVerified(false);
      setInput('');
      Alert.alert('CPF cadastrado', 'Seu CPF foi vinculado à conta.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      // The backend returns a uniform error on duplicate/already-set to
      // prevent enumeration. Surface the message as-is; it's already neutral.
      const msg = err instanceof ApiError && err.message
        ? err.message
        : 'Não foi possível cadastrar o CPF. Tente novamente.';
      Alert.alert('Erro', msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'CPF' }} />
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: 'CPF' }} />

        {existingCpf ? (
          // Read-only state — CPF is set-once and cannot be changed here.
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.statusRow}>
              <Ionicons
                name={cpfVerified ? 'shield-checkmark' : 'shield-outline'}
                size={22}
                color={cpfVerified ? colors.success[600] : colors.warning[600]}
              />
              <Text style={[styles.statusLabel, { color: theme.text }]}>
                {cpfVerified ? 'CPF verificado' : 'CPF cadastrado (não verificado)'}
              </Text>
            </View>
            <Text style={[styles.cpfMasked, { color: theme.text }]}>
              {maskCpf(existingCpf)}
            </Text>
            <Text style={[styles.help, { color: theme.textSecondary }]}>
              O CPF não pode ser alterado diretamente. Se houver um erro no
              cadastro, entre em contato com o suporte.
            </Text>
            {!cpfVerified && (
              <TouchableOpacity
                style={[styles.secondary, { borderColor: colors.primary[500] }]}
                onPress={() => router.push('/conta/verificacao')}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryText, { color: colors.primary[600] }]}>
                  Verificar CPF na Receita Federal
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.title, { color: theme.text }]}>
              Adicionar CPF
            </Text>
            <Text style={[styles.help, { color: theme.textSecondary }]}>
              Seu CPF é necessário para receber repasses via PIX e emitir notas
              fiscais. Ele é armazenado com segurança e nunca aparece no seu
              perfil público.
            </Text>
            <Text style={[styles.label, { color: theme.textSecondary }]}>CPF</Text>
            <TextInput
              style={[styles.input, {
                color: theme.text,
                borderColor: theme.border,
                backgroundColor: theme.inputBg,
              }]}
              value={input}
              onChangeText={(v) => setInput(formatCpfInput(v))}
              placeholder="000.000.000-00"
              placeholderTextColor={theme.textTertiary}
              keyboardType="number-pad"
              maxLength={14}
              autoFocus
              accessibilityLabel="CPF"
            />
            <Text style={[styles.warning, { color: theme.textTertiary }]}>
              Atenção: uma vez cadastrado, o CPF não pode ser alterado por esta
              tela.
            </Text>
            <TouchableOpacity
              style={[
                styles.primary,
                { backgroundColor: colors.primary[500] },
                (submitting || input.replace(/\D/g, '').length !== 11) && styles.primaryDisabled,
              ]}
              onPress={handleSubmit}
              disabled={submitting || input.replace(/\D/g, '').length !== 11}
              accessibilityRole="button"
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Cadastrar CPF</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 12 },
  card: { padding: 16, borderRadius: 12, borderWidth: 1 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  help: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 8, marginBottom: 6, textTransform: 'uppercase' },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, fontFamily: 'monospace', letterSpacing: 1,
  },
  warning: { fontSize: 12, marginTop: 8, lineHeight: 16 },
  primary: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    marginTop: 14,
  },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondary: {
    borderWidth: 1, borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', marginTop: 12,
  },
  secondaryText: { fontSize: 14, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  statusLabel: { fontSize: 15, fontWeight: '600' },
  cpfMasked: {
    fontSize: 20, fontFamily: 'monospace', fontWeight: '600',
    letterSpacing: 1, marginBottom: 12,
  },
});
