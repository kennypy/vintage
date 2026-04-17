import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import {
  listPayoutMethods, createPayoutMethod, setDefaultPayoutMethod, deletePayoutMethod,
  type PayoutMethodView, type PixKeyType,
} from '../../src/services/wallet';
import { ApiError } from '../../src/services/api';

const TYPE_LABELS: Record<PixKeyType, string> = {
  PIX_CPF: 'CPF',
  PIX_CNPJ: 'CNPJ',
  PIX_EMAIL: 'E-mail',
  PIX_PHONE: 'Telefone',
  PIX_RANDOM: 'Chave aleatória',
};

const TYPE_PLACEHOLDERS: Record<PixKeyType, string> = {
  PIX_CPF: '000.000.000-00',
  PIX_CNPJ: '00.000.000/0000-00',
  PIX_EMAIL: 'seu@email.com',
  PIX_PHONE: '+5511999998888',
  PIX_RANDOM: 'xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx',
};

export default function PayoutMethodsScreen() {
  const { theme } = useTheme();
  const [methods, setMethods] = useState<PayoutMethodView[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [newType, setNewType] = useState<PixKeyType>('PIX_EMAIL');
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newIsDefault, setNewIsDefault] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await listPayoutMethods();
      setMethods(data);
    } catch (_err) {
      // keep previous state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const resetAdd = () => {
    setNewType('PIX_EMAIL');
    setNewKey('');
    setNewLabel('');
    setNewIsDefault(false);
    setAddModal(false);
  };

  const handleAdd = async () => {
    if (!newKey.trim()) {
      Alert.alert('Erro', 'Informe a chave PIX.');
      return;
    }
    setSubmitting(true);
    try {
      await createPayoutMethod({
        type: newType,
        pixKey: newKey,
        label: newLabel.trim() || undefined,
        isDefault: newIsDefault,
      });
      resetAdd();
      await refresh();
      Alert.alert('Chave cadastrada', 'Você já pode usá-la nos seus saques.');
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : 'Não foi possível cadastrar.';
      Alert.alert('Erro', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (method: PayoutMethodView) => {
    Alert.alert(
      'Remover chave PIX',
      `${TYPE_LABELS[method.type]} ${method.pixKeyMasked}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePayoutMethod(method.id);
              await refresh();
            } catch (err) {
              const msg = err instanceof ApiError && err.message ? err.message : 'Erro ao remover.';
              Alert.alert('Erro', msg);
            }
          },
        },
      ],
    );
  };

  const handleSetDefault = async (method: PayoutMethodView) => {
    try {
      await setDefaultPayoutMethod(method.id);
      await refresh();
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : 'Erro ao atualizar padrão.';
      Alert.alert('Erro', msg);
    }
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
      <Stack.Screen options={{ title: 'Chaves PIX' }} />

      <Text style={[styles.help, { color: theme.textSecondary }]}>
        Suas chaves PIX para receber o saldo de vendas. Usamos apenas chaves
        salvas — nunca pedimos a chave a cada saque.
      </Text>

      {methods.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="card-outline" size={32} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Nenhuma chave cadastrada</Text>
          <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
            Cadastre uma chave para poder solicitar saques.
          </Text>
        </View>
      ) : (
        methods.map((m) => (
          <View key={m.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <View style={styles.inlineRow}>
                  <Text style={[styles.typeTag, { color: theme.textSecondary }]}>
                    {TYPE_LABELS[m.type]}
                  </Text>
                  {m.isDefault && (
                    <View style={[styles.defaultBadge, { backgroundColor: colors.success[50] }]}>
                      <Text style={[styles.defaultBadgeText, { color: colors.success[700] }]}>Padrão</Text>
                    </View>
                  )}
                </View>
                {m.label && (
                  <Text style={[styles.label, { color: theme.text }]}>{m.label}</Text>
                )}
                <Text style={[styles.keyMasked, { color: theme.text }]}>{m.pixKeyMasked}</Text>
              </View>
            </View>
            <View style={styles.actions}>
              {!m.isDefault && (
                <TouchableOpacity onPress={() => handleSetDefault(m)} accessibilityRole="button">
                  <Text style={[styles.actionLink, { color: colors.primary[600] }]}>Tornar padrão</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => handleDelete(m)} accessibilityRole="button">
                <Text style={[styles.actionLink, { color: colors.error[500] }]}>Remover</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary[500] }]}
        onPress={() => setAddModal(true)}
        accessibilityRole="button"
      >
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.buttonText}>Cadastrar chave PIX</Text>
      </TouchableOpacity>

      <Modal visible={addModal} animationType="slide" transparent onRequestClose={resetAdd}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Cadastrar chave PIX</Text>
              <TouchableOpacity onPress={resetAdd} accessibilityRole="button" accessibilityLabel="Fechar">
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Tipo</Text>
            <View style={styles.typePicker}>
              {(['PIX_CPF', 'PIX_CNPJ', 'PIX_EMAIL', 'PIX_PHONE', 'PIX_RANDOM'] as PixKeyType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.typeChip,
                    {
                      borderColor: newType === t ? colors.primary[500] : theme.border,
                      backgroundColor: newType === t ? colors.primary[50] : 'transparent',
                    },
                  ]}
                  onPress={() => setNewType(t)}
                  accessibilityRole="button"
                >
                  <Text
                    style={{
                      color: newType === t ? colors.primary[700] : theme.textSecondary,
                      fontSize: 13,
                      fontWeight: '600',
                    }}
                  >
                    {TYPE_LABELS[t]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Chave</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
              value={newKey}
              onChangeText={setNewKey}
              placeholder={TYPE_PLACEHOLDERS[newType]}
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="none"
              autoComplete="off"
              keyboardType={newType === 'PIX_EMAIL' ? 'email-address' : newType === 'PIX_PHONE' ? 'phone-pad' : 'default'}
            />

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
              Apelido (opcional)
            </Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder="Conta principal"
              placeholderTextColor={theme.textTertiary}
              maxLength={80}
            />

            <TouchableOpacity
              style={styles.defaultToggle}
              onPress={() => setNewIsDefault((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: newIsDefault }}
            >
              <Ionicons
                name={newIsDefault ? 'checkbox' : 'square-outline'}
                size={22}
                color={newIsDefault ? colors.primary[500] : theme.textTertiary}
              />
              <Text style={[styles.defaultToggleText, { color: theme.text }]}>
                Usar como padrão nos saques
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, submitting && styles.buttonDisabled, { backgroundColor: colors.primary[500] }]}
              onPress={handleAdd}
              disabled={submitting}
              accessibilityRole="button"
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Cadastrar</Text>}
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
  help: { fontSize: 13, lineHeight: 18 },
  emptyCard: {
    padding: 24, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', gap: 6,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600' },
  emptyDesc: { fontSize: 13, textAlign: 'center' },
  card: {
    padding: 14, borderRadius: 12, borderWidth: 1, gap: 10,
  },
  cardTop: { flexDirection: 'row' },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeTag: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  defaultBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  defaultBadgeText: { fontSize: 11, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '500', marginTop: 4 },
  keyMasked: { fontSize: 15, marginTop: 2, fontFamily: 'monospace' },
  actions: { flexDirection: 'row', gap: 18 },
  actionLink: { fontSize: 13, fontWeight: '600' },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 12, paddingVertical: 14, marginTop: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 6, textTransform: 'uppercase' },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
  },
  typePicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 18,
  },
  defaultToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
  },
  defaultToggleText: { fontSize: 14 },
});
