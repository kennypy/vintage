import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { requestEmailChange } from '../../src/services/auth';
import { ApiError } from '../../src/services/api';

export default function AlterarEmailScreen() {
  const router = useRouter();
  const { theme } = useTheme();

  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Erro', 'Informe um email válido.');
      return;
    }
    if (!password) {
      Alert.alert('Erro', 'Confirme sua senha atual.');
      return;
    }

    setLoading(true);
    try {
      const res = await requestEmailChange(email, password);
      Alert.alert(
        'Confirme no novo email',
        res.message ?? `Enviamos um link para ${email}. Abra o email e clique para confirmar a alteração.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : 'Não foi possível iniciar a alteração.';
      Alert.alert('Erro', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Alterar email' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          Enviaremos um link de confirmação para o novo endereço. Seu email atual continua válido até você clicar no link.
        </Text>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Novo email</Text>
          <TextInput
            style={[styles.inputSolo, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder="voce@exemplo.com"
            placeholderTextColor={theme.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            accessibilityLabel="Novo email"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Senha atual</Text>
          <View style={[styles.inputRow, { borderColor: theme.border, backgroundColor: theme.inputBg }]}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Sua senha atual"
              placeholderTextColor={theme.textTertiary}
              secureTextEntry={!showPassword}
              editable={!loading}
              autoComplete="current-password"
              accessibilityLabel="Senha atual"
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} accessibilityRole="button" accessibilityLabel="Mostrar senha">
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Enviar link de confirmação"
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Enviar link de confirmação</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  description: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingRight: 10,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 15 },
  inputSolo: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  button: {
    backgroundColor: colors.primary[500], borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
