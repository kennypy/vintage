import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, TextInput, Modal,
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
  setupSms2Fa, enableSms2Fa, resendEnrollmentSms,
  type SecurityStatus, type TwoFaSetup,
} from '../../src/services/auth';
import { ApiError } from '../../src/services/api';

type Mode = 'idle' | 'totp-setup' | 'sms-phone' | 'sms-code' | 'disable';

export default function SegurancaScreen() {
  const { theme } = useTheme();
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('idle');
  const [submitting, setSubmitting] = useState(false);

  // TOTP setup state
  const [totpSetup, setTotpSetup] = useState<TwoFaSetup | null>(null);

  // SMS setup state
  const [phoneInput, setPhoneInput] = useState('+55');
  const [smsPhoneHint, setSmsPhoneHint] = useState<string | null>(null);

  // Shared code input (used for TOTP enable, SMS enable, and disable)
  const [code, setCode] = useState('');

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

  const resetModal = () => {
    setMode('idle');
    setTotpSetup(null);
    setCode('');
    setPhoneInput('+55');
    setSmsPhoneHint(null);
  };

  // ── TOTP flow ──────────────────────────────────────────────────────
  const handleStartTotpSetup = async () => {
    setSubmitting(true);
    try {
      const data = await setupTwoFa();
      setTotpSetup(data);
      setCode('');
      setMode('totp-setup');
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : 'Não foi possível iniciar a configuração.';
      Alert.alert('Erro', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmTotpEnable = async () => {
    if (code.length !== 6) {
      Alert.alert('Erro', 'O código deve ter 6 dígitos.');
      return;
    }
    setSubmitting(true);
    try {
      await enableTwoFa(code);
      resetModal();
      await refresh();
      Alert.alert('2FA ativado', 'Sua conta agora exige um código a cada login.');
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : 'Código inválido.';
      Alert.alert('Erro', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopySecret = async () => {
    if (!totpSetup?.secret) return;
    await Clipboard.setStringAsync(totpSetup.secret);
    Alert.alert('Copiado', 'Chave secreta copiada para a área de transferência.');
  };

  // ── SMS flow ───────────────────────────────────────────────────────
  const handleStartSmsSetup = () => {
    setPhoneInput('+55');
    setCode('');
    setSmsPhoneHint(null);
    setMode('sms-phone');
  };

  const handleSendSmsCode = async () => {
    const phone = phoneInput.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      Alert.alert('Telefone inválido', 'Informe no formato E.164, ex: +5511999998888.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await setupSms2Fa(phone);
      setSmsPhoneHint(res.phoneHint);
      setCode('');
      setMode('sms-code');
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : 'Não foi possível enviar o SMS.';
      Alert.alert('Erro', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmSmsEnable = async () => {
    if (code.length !== 6) {
      Alert.alert('Erro', 'O código deve ter 6 dígitos.');
      return;
    }
    setSubmitting(true);
    try {
      await enableSms2Fa(code);
      resetModal();
      await refresh();
      Alert.alert('SMS 2FA ativado', 'Você receberá um código por SMS a cada login.');
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : 'Código inválido.';
      Alert.alert('Erro', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendSms = async () => {
    setSubmitting(true);
    try {
      const res = await resendEnrollmentSms();
      if (res.phoneHint) setSmsPhoneHint(res.phoneHint);
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : 'Não foi possível reenviar.';
      Alert.alert('Erro', msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Disable flow ───────────────────────────────────────────────────
  const handleStartDisable = () => {
    setCode('');
    setMode('disable');
  };

  const handleConfirmDisable = async () => {
    if (code.length !== 6) {
      Alert.alert('Erro', 'O código deve ter 6 dígitos.');
      return;
    }
    setSubmitting(true);
    try {
      await disableTwoFa(code);
      resetModal();
      await refresh();
      Alert.alert('2FA desativado', 'Você pode reativar quando quiser.');
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : 'Código inválido.';
      Alert.alert('Erro', msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  const enabled = !!status?.twoFaEnabled;
  const currentMethod = status?.twoFaMethod ?? 'TOTP';

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
          Protege sua conta exigindo um segundo fator a cada login — app autenticador ou SMS.
        </Text>

        {enabled ? (
          <>
            <View style={[styles.protectedBadge, { backgroundColor: colors.success[50] }]}>
              <Ionicons name="lock-closed" size={16} color={colors.success[700]} />
              <Text style={[styles.protectedText, { color: colors.success[700] }]}>
                {currentMethod === 'SMS'
                  ? `SMS ativo${status?.twoFaPhoneHint ? ` (${status.twoFaPhoneHint})` : ''}`
                  : 'Autenticador ativo'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.dangerButton, { borderColor: colors.error[400] }]}
              onPress={handleStartDisable}
              accessibilityRole="button"
            >
              <Text style={[styles.dangerButtonText, { color: colors.error[500] }]}>
                Desativar 2FA
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={handleStartTotpSetup}
              disabled={submitting}
              accessibilityRole="button"
            >
              {submitting && mode === 'idle' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Configurar com app autenticador</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.buttonSecondary, { borderColor: colors.primary[500] }]}
              onPress={handleStartSmsSetup}
              disabled={submitting}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonSecondaryText, { color: colors.primary[500] }]}>
                Configurar por SMS
              </Text>
            </TouchableOpacity>
          </>
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

      {/* Setup modal — content branches by `mode` */}
      <Modal visible={mode !== 'idle'} animationType="slide" transparent onRequestClose={resetModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {mode === 'totp-setup' && 'Configurar autenticador'}
                {mode === 'sms-phone' && 'Configurar SMS'}
                {mode === 'sms-code' && 'Confirmar telefone'}
                {mode === 'disable' && 'Desativar 2FA'}
              </Text>
              <TouchableOpacity onPress={resetModal} accessibilityRole="button" accessibilityLabel="Fechar">
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {mode === 'totp-setup' && (
              <>
                <Text style={[styles.instructions, { color: theme.textSecondary }]}>
                  1. Abra seu app autenticador e escaneie o QR code:
                </Text>
                {totpSetup?.qrCodeDataUrl && (
                  <View style={styles.qrContainer}>
                    <Image source={{ uri: totpSetup.qrCodeDataUrl }} style={styles.qr} contentFit="contain" />
                  </View>
                )}
                <Text style={[styles.instructions, { color: theme.textSecondary }]}>Ou informe manualmente:</Text>
                <TouchableOpacity onPress={handleCopySecret} accessibilityRole="button">
                  <Text style={[styles.secret, { color: theme.text, backgroundColor: theme.inputBg }]}>
                    {totpSetup?.secret ?? ''}
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.instructions, { color: theme.textSecondary, marginTop: 12 }]}>
                  2. Informe o código de 6 dígitos do app:
                </Text>
                <TextInput
                  style={[styles.codeInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="123456"
                  placeholderTextColor={theme.textTertiary}
                />
                <TouchableOpacity
                  style={[styles.button, submitting && styles.buttonDisabled]}
                  onPress={handleConfirmTotpEnable}
                  disabled={submitting}
                  accessibilityRole="button"
                >
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Ativar 2FA</Text>}
                </TouchableOpacity>
              </>
            )}

            {mode === 'sms-phone' && (
              <>
                <Text style={[styles.instructions, { color: theme.textSecondary }]}>
                  Informe seu celular no formato E.164 (com DDI):
                </Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
                  value={phoneInput}
                  onChangeText={setPhoneInput}
                  keyboardType="phone-pad"
                  placeholder="+5511999998888"
                  placeholderTextColor={theme.textTertiary}
                  autoComplete="tel"
                  accessibilityLabel="Telefone 2FA"
                />
                <TouchableOpacity
                  style={[styles.button, submitting && styles.buttonDisabled]}
                  onPress={handleSendSmsCode}
                  disabled={submitting}
                  accessibilityRole="button"
                >
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Enviar código</Text>}
                </TouchableOpacity>
              </>
            )}

            {mode === 'sms-code' && (
              <>
                <Text style={[styles.instructions, { color: theme.textSecondary }]}>
                  Digite o código enviado para {smsPhoneHint ?? 'seu telefone'}. Válido por 5 minutos.
                </Text>
                <TextInput
                  style={[styles.codeInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="123456"
                  placeholderTextColor={theme.textTertiary}
                />
                <TouchableOpacity
                  style={[styles.button, submitting && styles.buttonDisabled]}
                  onPress={handleConfirmSmsEnable}
                  disabled={submitting}
                  accessibilityRole="button"
                >
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Ativar SMS 2FA</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleResendSms}
                  disabled={submitting}
                  style={styles.resendLink}
                  accessibilityRole="button"
                >
                  <Text style={[styles.resendText, { color: colors.primary[600] }]}>
                    {submitting ? 'Reenviando…' : 'Reenviar código'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {mode === 'disable' && (
              <>
                <Text style={[styles.instructions, { color: theme.textSecondary }]}>
                  {currentMethod === 'SMS'
                    ? 'Solicite um código SMS e informe abaixo para confirmar.'
                    : 'Informe o código atual do seu app autenticador:'}
                </Text>
                {currentMethod === 'SMS' && (
                  <TouchableOpacity
                    style={[styles.buttonSecondary, { borderColor: colors.primary[500] }]}
                    onPress={handleResendSms}
                    disabled={submitting}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.buttonSecondaryText, { color: colors.primary[500] }]}>
                      {submitting ? 'Enviando…' : 'Enviar código SMS'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TextInput
                  style={[styles.codeInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="123456"
                  placeholderTextColor={theme.textTertiary}
                />
                <TouchableOpacity
                  style={[styles.dangerButton, { borderColor: colors.error[400] }]}
                  onPress={handleConfirmDisable}
                  disabled={submitting}
                  accessibilityRole="button"
                >
                  {submitting ? (
                    <ActivityIndicator color={colors.error[500]} />
                  ) : (
                    <Text style={[styles.dangerButtonText, { color: colors.error[500] }]}>
                      Desativar 2FA
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
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
  card: { borderRadius: 12, padding: 16, borderWidth: 1 },
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
    borderRadius: 8, alignSelf: 'flex-start', marginBottom: 12,
  },
  protectedText: { fontSize: 12, fontWeight: '600' },
  button: {
    backgroundColor: colors.primary[500], borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonSecondary: {
    borderWidth: 1, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  buttonSecondaryText: { fontSize: 16, fontWeight: '600' },
  dangerButton: {
    borderWidth: 1, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 12,
  },
  dangerButtonText: { fontSize: 15, fontWeight: '600' },
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
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    marginTop: 6,
  },
  codeInput: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 18,
    textAlign: 'center', letterSpacing: 4, marginTop: 6,
  },
  resendLink: { marginTop: 12, alignItems: 'center' },
  resendText: { fontSize: 14, fontWeight: '600' },
});
