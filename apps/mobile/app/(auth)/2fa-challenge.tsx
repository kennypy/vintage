import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useState } from 'react';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { resendLoginSms } from '../../src/services/auth';
import { TurnstileWebView } from '../../src/components/TurnstileWebView';
import { ApiError } from '../../src/services/api';

export default function TwoFaChallengeScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { completeTwoFaChallenge } = useAuth();
  const params = useLocalSearchParams<{
    tempToken?: string;
    method?: string;
    phoneHint?: string;
  }>();

  const tempToken = params.tempToken ?? '';
  const method = (params.method === 'SMS' ? 'SMS' : 'TOTP') as 'SMS' | 'TOTP';
  const phoneHint = params.phoneHint ?? '';

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCaptchaToken, setResendCaptchaToken] = useState<string | null>(null);
  const [resentMessage, setResentMessage] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (code.length !== 6) {
      Alert.alert('Erro', 'O código deve ter 6 dígitos.');
      return;
    }
    if (!tempToken) {
      Alert.alert('Erro', 'Sessão expirada. Faça login novamente.');
      router.replace('/(auth)/login');
      return;
    }
    setSubmitting(true);
    try {
      await completeTwoFaChallenge(tempToken, code);
      router.replace('/(tabs)');
    } catch (err) {
      const msg =
        err instanceof ApiError && err.message
          ? err.message
          : 'Código inválido ou expirado.';
      Alert.alert('Erro', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (method !== 'SMS') return;
    if (!tempToken) return;
    setResending(true);
    setResentMessage(null);
    try {
      const res = await resendLoginSms(tempToken, resendCaptchaToken);
      setResentMessage(`Novo código enviado para ${res.phoneHint}.`);
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : 'Não foi possível reenviar.';
      Alert.alert('Erro', msg);
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Verificação em 2 etapas', headerBackVisible: false }} />
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>
          {method === 'SMS' ? 'Informe o código SMS' : 'Informe o código do autenticador'}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {method === 'SMS'
            ? `Enviamos um código de 6 dígitos para ${phoneHint || 'seu telefone'}. Válido por 5 minutos.`
            : 'Abra seu app autenticador (Google Authenticator, Authy, 1Password...) e digite o código de 6 dígitos atual.'}
        </Text>

        <TextInput
          style={[
            styles.codeInput,
            { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg },
          ]}
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="123456"
          placeholderTextColor={theme.textTertiary}
          accessibilityLabel="Código de verificação"
          autoFocus
        />

        <TouchableOpacity
          style={[styles.button, (submitting || code.length !== 6) && styles.buttonDisabled]}
          onPress={handleConfirm}
          disabled={submitting || code.length !== 6}
          accessibilityRole="button"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Verificar</Text>
          )}
        </TouchableOpacity>

        {method === 'SMS' && (
          <>
            <TurnstileWebView
              onToken={setResendCaptchaToken}
              onExpired={() => setResendCaptchaToken(null)}
            />
            <TouchableOpacity
              onPress={handleResend}
              disabled={resending}
              style={styles.resendLink}
              accessibilityRole="button"
            >
              <Text style={[styles.resendText, { color: colors.primary[600] }]}>
                {resending ? 'Reenviando…' : 'Reenviar código'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {resentMessage && (
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>{resentMessage}</Text>
        )}

        <TouchableOpacity
          onPress={() => router.replace('/(auth)/login')}
          style={styles.cancelLink}
          accessibilityRole="button"
        >
          <Text style={[styles.cancelText, { color: theme.textTertiary }]}>
            Voltar ao login
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 20, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 24 },
  codeInput: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14, fontSize: 22,
    textAlign: 'center', letterSpacing: 8, marginBottom: 16,
  },
  button: {
    backgroundColor: colors.primary[500], borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resendLink: { marginTop: 16, alignItems: 'center' },
  resendText: { fontSize: 14, fontWeight: '600' },
  cancelLink: { marginTop: 24, alignItems: 'center' },
  cancelText: { fontSize: 13 },
  infoText: { marginTop: 12, fontSize: 13, textAlign: 'center' },
});
