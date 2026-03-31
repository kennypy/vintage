import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { signIn, signInDemo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Campos obrigatórios', 'Preencha email e senha.');
      return;
    }

    setLoading(true);
    try {
      await signIn(email, password);
      router.replace('/(tabs)');
    } catch (_error) {
      Alert.alert('Erro ao entrar', 'Email ou senha incorretos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={[styles.logo, { color: colors.primary[600] }]}>Vintage.br</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Entre na sua conta</Text>

        <View style={styles.form}>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
            placeholder="Email"
            placeholderTextColor={theme.textTertiary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
            placeholder="Senha"
            placeholderTextColor={theme.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton}>
            <Text style={[styles.linkText, { color: colors.primary[600] }]}>Esqueceu a senha?</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          <Text style={[styles.dividerText, { color: theme.textTertiary }]}>ou</Text>
          <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
        </View>

        <TouchableOpacity style={[styles.socialButton, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={[styles.socialButtonText, { color: theme.text }]}>Continuar com Google</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.socialButton, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={[styles.socialButtonText, { color: theme.text }]}>Continuar com Apple</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.demoButton}
          onPress={async () => {
            await signInDemo();
            router.replace('/(tabs)');
          }}
        >
          <Text style={[styles.demoButtonText, { color: theme.textTertiary }]}>Testar em modo demo (sem conta)</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>Não tem conta? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={[styles.footerLink, { color: colors.primary[600] }]}>Cadastre-se</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  logo: { fontSize: 32, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center', marginTop: 8, marginBottom: 32 },
  form: { gap: 12 },
  input: {
    height: 50, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 16, fontSize: 16,
  },
  button: {
    height: 50, backgroundColor: colors.primary[600], borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.neutral[0], fontSize: 16, fontWeight: '600' },
  linkButton: { alignItems: 'center', paddingVertical: 8 },
  linkText: { fontSize: 14 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 16, fontSize: 14 },
  socialButton: {
    height: 50, borderWidth: 1, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  socialButtonText: { fontSize: 15, fontWeight: '500' },
  demoButton: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  demoButtonText: { fontSize: 13, textDecorationLine: 'underline' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { fontSize: 14 },
  footerLink: { fontSize: 14, fontWeight: '600' },
});
