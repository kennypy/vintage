import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { colors } from '../../src/theme/colors';

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const formatCpf = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };

  const handleRegister = async () => {
    setLoading(true);
    // TODO: Call auth API
    setTimeout(() => {
      setLoading(false);
      router.replace('/(tabs)');
    }, 1000);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.logo}>Vintage.br</Text>
        <Text style={styles.subtitle}>Crie sua conta</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Nome completo"
            placeholderTextColor={colors.neutral[400]}
            value={name}
            onChangeText={setName}
            autoComplete="name"
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.neutral[400]}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <TextInput
            style={styles.input}
            placeholder="CPF"
            placeholderTextColor={colors.neutral[400]}
            value={cpf}
            onChangeText={(t) => setCpf(formatCpf(t))}
            keyboardType="numeric"
            maxLength={14}
          />
          <TextInput
            style={styles.input}
            placeholder="Senha (mín. 8 caracteres)"
            placeholderTextColor={colors.neutral[400]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Criando conta...' : 'Criar conta'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.terms}>
          Ao criar conta, você concorda com os{' '}
          <Text style={styles.termsLink}>Termos de Uso</Text> e a{' '}
          <Text style={styles.termsLink}>Política de Privacidade</Text>.
        </Text>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Já tem conta? </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.footerLink}>Entrar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[0] },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  logo: { fontSize: 32, fontWeight: '700', color: colors.primary[600], textAlign: 'center' },
  subtitle: { fontSize: 16, color: colors.neutral[500], textAlign: 'center', marginTop: 8, marginBottom: 32 },
  form: { gap: 12 },
  input: {
    height: 50, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: 12,
    paddingHorizontal: 16, fontSize: 16, color: colors.neutral[900],
    backgroundColor: colors.neutral[50],
  },
  button: {
    height: 50, backgroundColor: colors.primary[600], borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.neutral[0], fontSize: 16, fontWeight: '600' },
  terms: {
    textAlign: 'center', color: colors.neutral[400], fontSize: 12, lineHeight: 18,
    marginTop: 20, paddingHorizontal: 16,
  },
  termsLink: { color: colors.primary[600] },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { color: colors.neutral[500], fontSize: 14 },
  footerLink: { color: colors.primary[600], fontSize: 14, fontWeight: '600' },
});
