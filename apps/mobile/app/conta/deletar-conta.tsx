import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { apiFetch } from '../../src/services/api';

/**
 * LGPD delete-account flow — mobile mirror of the web page at
 * /conta/deletar-conta. Calls the same DELETE /users/me endpoint
 * with an optional password or emailCode depending on the account.
 *
 * Typed "EXCLUIR" gate prevents muscle-memory deletions. Reason is
 * optional — anything the user writes lands in DeletionAuditLog
 * for product learning.
 */
export default function DeletarContaScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { signOut, isDemoMode } = useAuth();

  const [method, setMethod] = useState<'password' | 'emailCode'>('password');
  const [password, setPassword] = useState('');
  const [confirmToken, setConfirmToken] = useState('');
  const [reason, setReason] = useState('');
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const confirmationArmed = typedConfirmation === 'EXCLUIR';

  const requestCode = async () => {
    setBusy(true);
    try {
      await apiFetch('/users/me/delete-confirmation', { method: 'POST' });
      setCodeSent(true);
      Alert.alert(
        'Código enviado',
        'Verifique seu email (incluindo spam) pelo código de 6 dígitos.',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao enviar código.';
      Alert.alert('Erro', msg);
    } finally {
      setBusy(false);
    }
  };

  const confirmAndDelete = async () => {
    if (!confirmationArmed) {
      Alert.alert('Confirmação', 'Digite EXCLUIR em maiúsculas para prosseguir.');
      return;
    }
    Alert.alert(
      'Tem certeza?',
      'Esta ação inicia a exclusão permanente da conta. Não pode ser desfeita depois de 30 dias.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, excluir',
          style: 'destructive',
          onPress: runDelete,
        },
      ],
    );
  };

  const runDelete = async () => {
    setBusy(true);
    try {
      // Demo mode has no server-side account — the "user" only ever
      // existed on-device. signOut() clears the local demo record and
      // disables the flag, which is what deletion actually means here.
      if (isDemoMode) {
        await signOut();
        router.replace('/(tabs)');
        return;
      }

      const body: Record<string, string> = {};
      if (method === 'password' && password) body.password = password;
      if (method === 'emailCode' && confirmToken) body.confirmToken = confirmToken;
      if (reason.trim()) body.reason = reason.trim().slice(0, 500);

      await apiFetch('/users/me', {
        method: 'DELETE',
        body: JSON.stringify(body),
      });
      // Server already anonymised the row. Clear local session and
      // bounce to home — AppShell auth guard will redirect to login.
      await signOut();
      router.replace('/(tabs)');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível excluir a conta.';
      Alert.alert('Erro', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <Stack.Screen options={{ title: 'Excluir conta' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.warningBox}>
          <Ionicons name="warning" size={20} color="#b45309" />
          <Text style={styles.warningText}>
            Seus dados pessoais são anonimizados imediatamente e apagados em
            definitivo após 30 dias. Pedidos em andamento seguem seu curso.
            Notas fiscais permanecem pelo prazo legal (5 anos).
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.text }]}>Método de verificação</Text>
        <View style={styles.radioRow}>
          <RadioOption
            label="Senha"
            selected={method === 'password'}
            onPress={() => setMethod('password')}
          />
          <RadioOption
            label="Código por email"
            selected={method === 'emailCode'}
            onPress={() => setMethod('emailCode')}
          />
        </View>

        {method === 'password' && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>Senha atual</Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg },
              ]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              editable={!busy}
            />
          </View>
        )}

        {method === 'emailCode' && (
          <View style={styles.field}>
            {!codeSent ? (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={requestCode}
                disabled={busy}
              >
                <Text style={styles.secondaryBtnText}>
                  {busy ? 'Enviando…' : 'Enviar código por email'}
                </Text>
              </TouchableOpacity>
            ) : (
              <>
                <Text style={[styles.label, { color: theme.text }]}>Código de 6 dígitos</Text>
                <TextInput
                  style={[
                    styles.input,
                    { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg },
                  ]}
                  value={confirmToken}
                  onChangeText={(v) => setConfirmToken(v.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!busy}
                />
              </>
            )}
          </View>
        )}

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Motivo (opcional)</Text>
          <TextInput
            style={[
              styles.input,
              styles.textarea,
              { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg },
            ]}
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={500}
            placeholder="Nos ajuda a melhorar. Nada aqui é obrigatório."
            placeholderTextColor={theme.textTertiary}
            editable={!busy}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>
            Digite EXCLUIR para confirmar
          </Text>
          <TextInput
            style={[
              styles.input,
              { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg },
            ]}
            value={typedConfirmation}
            onChangeText={setTypedConfirmation}
            autoCapitalize="characters"
            editable={!busy}
          />
        </View>

        <TouchableOpacity
          style={[styles.dangerBtn, (!confirmationArmed || busy) && { opacity: 0.5 }]}
          onPress={confirmAndDelete}
          disabled={!confirmationArmed || busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.dangerBtnText}>Excluir minha conta</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={[styles.cancelText, { color: theme.textTertiary }]}>Cancelar</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function RadioOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.radioOption} onPress={onPress}>
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={22}
        color={selected ? colors.primary[500] : colors.neutral[400]}
      />
      <Text style={styles.radioLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  warningBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#78350f',
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  radioRow: {
    flexDirection: 'row',
    gap: 16,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  radioLabel: {
    fontSize: 14,
  },
  field: {
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.neutral[100],
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  secondaryBtnText: {
    fontSize: 14,
    color: colors.neutral[700],
    fontWeight: '500',
  },
  dangerBtn: {
    marginTop: 16,
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  dangerBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 13,
  },
});
