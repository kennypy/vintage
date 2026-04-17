import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import {
  getSecurityStatus, setupTwoFa, enableTwoFa, disableTwoFa,
  type SecurityStatus, type TwoFaSetup,
} from '../../src/services/auth';
import { ApiError } from '../../src/services/api';

export default function SegurancaScreen() {
  const { theme } = useTheme();
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupModalVisible, setSetupModalVisible] = useState(false);
  const [setupData, setSetupData] = useState<TwoFaSetup | null>(null);
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await getSecurityStatus();
      setStatus(data);
    } catch (_err) {
      // Keep previous status on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleStartSetup = async () => {
    setSubmitting(true);
    try {
      const data = await setupTwoFa();
      setSetupData(data);
      setToken('');
      setSetupModalVisible(true);
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : 'Não foi possível iniciar a configuração.';
      Alert.alert('Erro', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmEnable = async () => {
    if (token.length !== 6) {
      Alert.alert('Erro', 'O código deve ter 6 dígitos.');
      return;
    }
    setSubmitting(true);
    try {
      await enableTwoFa(token);
      setSetupModalVisible(false);
      setSetupData(null);
      setToken('');
      await refresh();
      Alert.alert('2FA ativado', 'Sua conta agora exige um código a cada login.');
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : 'Código inválido.';
      Alert.alert('Erro', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisable = () => {
    Alert.prompt?.(
      'Desativar 2FA',
      'Informe o código atual do seu aplicativo autenticador:',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desativar',
          style: 'destructive',
          onPress: async (input?: string) => {
            const code = (input ?? '').replace(/\D/g, '').slice(0, 6);
            if (code.length !== 6) {
              Alert.alert('Erro', 'O código deve ter 6 dígitos.');
              return;
            }
            try {
              await disableTwoFa(code);
              await refresh();
              Alert.alert('2FA desativado', 'Você pode reativar quando quiser.');
            } catch (err) {
              const msg = err instanceof ApiError && err.message ? err.message : 'Código inválido.';
              Alert.alert('Erro', msg);
            }
          },
        },
      ],
      'plain-text',
    );
    // Android does not support Alert.prompt — fallback via alternate input flow
    if (!Alert.prompt) {
      Alert.alert(
        'Desativar 2FA',
        'Use o app no iOS para desativar pelo prompt, ou contate o suporte.',
      );
    }
  };

  const handleCopySecret = async () => {
    if (!setupData?.secret) return;
    await Clipboard.setStringAsync(setupData.secret);
    Alert.alert('Copiado', 'Chave secreta copiada para a área de transferência.');
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <Stack.Screen options={{ title: 'Segurança' }} />

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="shield-checkmark-outline" size={24} color={colors.primary[500]} />
          <Text style={[styles.cardTitle, { color: theme.text }]}>Autenticação em 2 etapas</Text>
        </View>
        <Text style={[styles.cardDesc, { color: theme.textSecondary }]}>
          Protege sua conta exigindo um código do seu aplicativo autenticador a cada login.
        </Text>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.text }]}>Status</Text>
          <Switch
            value={status?.twoFaEnabled ?? false}
            onValueChange={(v) => (v ? handleStartSetup() : handleDisable())}
            trackColor={{ true: colors.primary[500] }}
            disabled={submitting}
            accessibilityLabel="Ativar 2FA"
          />
        </View>
        {status?.twoFaEnabled && (
          <View style={[styles.protectedBadge, { backgroundColor: colors.success[50] }]}>
            <Ionicons name="lock-closed" size={16} color={colors.success[700]} />
            <Text style={[styles.protectedText, { color: colors.success[700] }]}>
              {status.isContaProtegida ? 'Conta protegida ativa' : '2FA ativo'}
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="time-outline" size={24} color={colors.primary[500]} />
          <Text style={[styles.cardTitle, { color: theme.text }]}>Acessos recentes</Text>
        </View>
        {(status?.recentLogins ?? []).length === 0 ? (
          <Text style={[styles.cardDesc, { color: theme.textSecondary }]}>
            Nenhum acesso registrado ainda.
          </Text>
        ) : (
          (status?.recentLogins ?? []).map((ev, idx) => (
            <View key={idx} style={[styles.row, idx > 0 && { borderTopWidth: 1, borderTopColor: theme.divider, paddingTop: 12, marginTop: 4 }]}>
              <View>
                <Text style={[styles.rowLabel, { color: theme.text }]}>
                  {ev.platform === 'ios' ? 'iPhone' : ev.platform === 'android' ? 'Android' : ev.platform === 'web' ? 'Web' : 'Desconhecido'}
                </Text>
                <Text style={[styles.rowSub, { color: theme.textTertiary }]}>
                  {new Date(ev.createdAt).toLocaleString('pt-BR')}
                </Text>
              </View>
              <View style={[styles.chip, { backgroundColor: ev.success ? colors.success[50] : colors.error[50] }]}>
                <Text style={[styles.chipText, { color: ev.success ? colors.success[700] : colors.error[600] }]}>
                  {ev.success ? 'OK' : 'Falhou'}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      <Modal visible={setupModalVisible} animationType="slide" transparent onRequestClose={() => setSetupModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Configurar 2FA</Text>
              <TouchableOpacity
                onPress={() => setSetupModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Fechar"
              >
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.instructions, { color: theme.textSecondary }]}>
              1. Abra seu app autenticador (Google Authenticator, Authy, 1Password...) e escaneie o QR code abaixo.
            </Text>

            {setupData?.qrCodeDataUrl && (
              <View style={styles.qrContainer}>
                <Image source={{ uri: setupData.qrCodeDataUrl }} style={styles.qr} contentFit="contain" />
              </View>
            )}

            <Text style={[styles.instructions, { color: theme.textSecondary }]}>
              Ou informe manualmente a chave:
            </Text>
            <TouchableOpacity onPress={handleCopySecret} accessibilityRole="button">
              <Text style={[styles.secret, { color: theme.text, backgroundColor: theme.inputBg }]}>
                {setupData?.secret ?? ''}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.instructions, { color: theme.textSecondary, marginTop: 12 }]}>
              2. Informe o código de 6 dígitos gerado pelo app:
            </Text>
            <TextInput
              style={[styles.codeInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
              value={token}
              onChangeText={(v) => setToken(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="123456"
              placeholderTextColor={theme.textTertiary}
              accessibilityLabel="Código 2FA"
            />

            <TouchableOpacity
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={handleConfirmEnable}
              disabled={submitting}
              accessibilityRole="button"
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Ativar 2FA</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 12 },
  card: {
    borderRadius: 12, padding: 16, borderWidth: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardDesc: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8,
  },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowSub: { fontSize: 12, marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  chipText: { fontSize: 12, fontWeight: '600' },
  protectedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, alignSelf: 'flex-start', marginTop: 8,
  },
  protectedText: { fontSize: 12, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  instructions: { fontSize: 14, lineHeight: 20 },
  qrContainer: { alignItems: 'center', marginVertical: 16 },
  qr: { width: 180, height: 180, backgroundColor: '#fff', borderRadius: 8 },
  secret: {
    fontSize: 13, fontFamily: 'monospace',
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8,
    marginTop: 6, textAlign: 'center',
  },
  codeInput: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 18,
    textAlign: 'center', letterSpacing: 4, marginTop: 6,
  },
  button: {
    backgroundColor: colors.primary[500], borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
