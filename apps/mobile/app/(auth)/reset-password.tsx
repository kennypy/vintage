import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { resetPassword } from '../../src/services/auth';
import { ApiError } from '../../src/services/api';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === 'string' ? params.token : '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!token) {
      Alert.alert('Link inválido', 'Abra o link recebido por email.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Erro', 'A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Erro', 'A confirmação não coincide.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      Alert.alert('Senha redefinida', 'Use sua nova senha para entrar.', [
        { text: 'OK', onPress: () => router.replace('/(auth)/login') },
      ]);
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : 'Não foi possível redefinir a senha.';
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
      <Stack.Screen options={{ title: 'Nova senha' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Ionicons name="key-outline" size={48} color={colors.primary[500]} />
        <Text style={[styles.title, { color: theme.text }]}>Criar nova senha</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Escolha uma senha com pelo menos 8 caracteres.
        </Text>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Nova senha</Text>
          <View style={[styles.inputRow, { borderColor: theme.border, backgroundColor: theme.inputBg }]}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Mínimo 8 caracteres"
              placeholderTextColor={theme.textTertiary}
              secureTextEntry={!show}
              editable={!loading}
              autoComplete="new-password"
              accessibilityLabel="Nova senha"
            />
            <TouchableOpacity onPress={() => setShow((v) => !v)} accessibilityRole="button" accessibilityLabel="Mostrar senha">
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Confirmar senha</Text>
          <TextInput
            style={[styles.inputSolo, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repita a nova senha"
            placeholderTextColor={theme.textTertiary}
            secureTextEntry={!show}
            editable={!loading}
            autoComplete="new-password"
            accessibilityLabel="Confirmar nova senha"
          />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          accessibilityRole="button"
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Redefinir senha</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', marginBottom: 24 },
  field: { width: '100%', marginBottom: 16 },
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
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
    width: '100%',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
