import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { forgotPassword } from '../../src/services/auth';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert('Email obrigatório', 'Informe o email cadastrado na sua conta.');
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(trimmed);
      setSent(true);
    } catch (_err) {
      // Server always returns neutral response; show success UI anyway
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Esqueci a senha' }} />
      <View style={styles.content}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.primary[500]} />
        <Text style={[styles.title, { color: theme.text }]}>Redefinir senha</Text>

        {!sent ? (
          <>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Informe o email cadastrado e enviaremos um link para criar uma nova senha.
            </Text>
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.text }]}>Email</Text>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
                value={email}
                onChangeText={setEmail}
                placeholder="voce@exemplo.com"
                placeholderTextColor={theme.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                editable={!loading}
                accessibilityLabel="Email"
              />
            </View>
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Enviar link de redefinição"
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Enviar link</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Se este email estiver cadastrado, você receberá em alguns minutos instruções para redefinir sua senha.
              Lembre-se de verificar a caixa de spam.
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => router.replace('/(auth)/login')}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Voltar ao login</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.linkButton} onPress={() => router.back()}>
          <Text style={[styles.linkText, { color: colors.primary[600] }]}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  field: { width: '100%', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  button: {
    backgroundColor: colors.primary[500], borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
    width: '100%',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkButton: { paddingVertical: 14 },
  linkText: { fontSize: 14, fontWeight: '500' },
});
