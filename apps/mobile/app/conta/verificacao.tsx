import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { apiFetch } from '../../src/services/api';

/**
 * Real Serpro-backed CPF + name + DOB identity verification. Replaces
 * the earlier placeholder screen that called no endpoint. Backend path
 * is POST /users/me/verify-identity (apps/api/src/identity/).
 */

interface SecurityStatus {
  cpfChecksumValid?: boolean;
  cpfIdentityVerified?: boolean;
  cpfVerified?: boolean;
  twoFaEnabled?: boolean;
  isContaProtegida?: boolean;
}

type VerifyStatus =
  | 'VERIFIED'
  | 'NAME_MISMATCH'
  | 'CPF_SUSPENDED'
  | 'CPF_CANCELED'
  | 'DECEASED'
  | 'PROVIDER_ERROR'
  | 'CONFIG_ERROR';

interface VerifyResponse {
  status: VerifyStatus;
  identityVerified: boolean;
  message: string;
}

export default function VerificacaoScreen() {
  const router = useRouter();
  const { theme } = useTheme();

  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [birthDate, setBirthDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<SecurityStatus>('/auth/security-status')
      .then((data) => setStatus(data))
      .catch(() => setStatus({}))
      .finally(() => setLoading(false));
  }, []);

  const verified = status?.cpfIdentityVerified === true;

  const handleSubmit = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      Alert.alert(
        'Data inválida',
        'Informe a data no formato AAAA-MM-DD (ex.: 1990-01-15).',
      );
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiFetch<VerifyResponse>('/users/me/verify-identity', {
        method: 'POST',
        body: JSON.stringify({ birthDate }),
      });
      if (result.status === 'VERIFIED') {
        setStatus({ ...status, cpfIdentityVerified: true });
        Alert.alert('Tudo certo', result.message);
      } else {
        Alert.alert('Não foi possível verificar', result.message);
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível verificar agora. Tente novamente.';
      Alert.alert('Erro', msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <Stack.Screen options={{ title: 'Verificação' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.iconCircle}>
            <Ionicons
              name={verified ? 'shield-checkmark' : 'shield-outline'}
              size={40}
              color={verified ? colors.success[600] : colors.warning[600]}
            />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>
            Verificação de identidade
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Confirmamos seu CPF, nome e data de nascimento diretamente
            com a Receita Federal. Obrigatório para saques e notas fiscais.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.statusLabel, { color: theme.textSecondary }]}>Status</Text>
          {verified ? (
            <View style={[styles.badge, styles.badgeOk]}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success[700]} />
              <Text style={styles.badgeOkText}>Verificado</Text>
            </View>
          ) : (
            <View style={[styles.badge, styles.badgePending]}>
              <Ionicons name="hourglass" size={16} color={colors.warning[700]} />
              <Text style={styles.badgePendingText}>Pendente</Text>
            </View>
          )}
        </View>

        {!verified ? (
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.label, { color: theme.text }]}>
              Data de nascimento
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.text,
                  borderColor: theme.border,
                  backgroundColor: theme.inputBg,
                },
              ]}
              value={birthDate}
              onChangeText={(v) => setBirthDate(v.replace(/[^\d-]/g, ''))}
              placeholder="AAAA-MM-DD"
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={10}
              editable={!submitting}
            />
            <Text style={[styles.hint, { color: theme.textTertiary }]}>
              Os dados precisam conferir exatamente com o cadastro na Receita.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, submitting && { opacity: 0.5 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Verificar identidade</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.successCard]}>
            <Text style={styles.successText}>
              Sua identidade está verificada. Saques e emissão de notas
              fiscais estão liberados.
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/conta/cpf')}>
          <Text style={[styles.linkText, { color: colors.primary[600] }]}>
            Precisa corrigir seu CPF?
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12 },
  hero: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 13, textAlign: 'center', lineHeight: 18, maxWidth: 320 },
  card: {
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  statusLabel: { fontSize: 13 },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeOk: { backgroundColor: '#dcfce7' },
  badgeOkText: { color: '#166534', fontSize: 12, fontWeight: '600' },
  badgePending: { backgroundColor: '#fef3c7' },
  badgePendingText: { color: '#92400e', fontSize: 12, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '500' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  hint: { fontSize: 11, marginTop: -4 },
  primaryBtn: {
    backgroundColor: colors.primary[600],
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  successCard: {
    backgroundColor: '#ecfdf5',
    borderColor: '#6ee7b7',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  successText: { color: '#065f46', fontSize: 13, lineHeight: 18 },
  linkRow: { paddingVertical: 10, alignItems: 'center' },
  linkText: { fontSize: 13, fontWeight: '500' },
});
