import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { changePassword } from '../../src/services/auth';
import { ApiError } from '../../src/services/api';

export default function AlterarSenhaScreen() {
  const router = useRouter();
  const { theme } = useTheme();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!currentPassword) {
      Alert.alert('Erro', 'Informe sua senha atual.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Erro', 'A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Erro', 'A confirmação não coincide com a nova senha.');
      return;
    }
    if (newPassword === currentPassword) {
      Alert.alert('Erro', 'A nova senha deve ser diferente da atual.');
      return;
    }

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      Alert.alert('Sucesso', 'Sua senha foi alterada com sucesso.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : 'Não foi possível alterar a senha.';
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
      <Stack.Screen options={{ title: 'Alterar senha' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          Escolha uma nova senha com pelo menos 8 caracteres. Evite reutilizar senhas de outros sites.
        </Text>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Senha atual</Text>
          <View style={[styles.inputRow, { borderColor: theme.border, backgroundColor: theme.inputBg }]}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Sua senha atual"
              placeholderTextColor={theme.textTertiary}
              secureTextEntry={!showCurrent}
              editable={!loading}
              autoComplete="current-password"
              accessibilityLabel="Senha atual"
            />
            <TouchableOpacity onPress={() => setShowCurrent((v) => !v)} accessibilityRole="button" accessibilityLabel="Mostrar senha">
              <Ionicons name={showCurrent ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Nova senha</Text>
          <View style={[styles.inputRow, { borderColor: theme.border, backgroundColor: theme.inputBg }]}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Mínimo 8 caracteres"
              placeholderTextColor={theme.textTertiary}
              secureTextEntry={!showNew}
              editable={!loading}
              autoComplete="new-password"
              accessibilityLabel="Nova senha"
            />
            <TouchableOpacity onPress={() => setShowNew((v) => !v)} accessibilityRole="button" accessibilityLabel="Mostrar nova senha">
              <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Confirmar nova senha</Text>
          <TextInput
            style={[styles.inputSolo, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repita a nova senha"
            placeholderTextColor={theme.textTertiary}
            secureTextEntry={!showNew}
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
          accessibilityLabel="Salvar nova senha"
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Salvar nova senha</Text>}
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
