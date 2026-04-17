import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../src/theme/colors';
import { useTheme } from '../../../src/contexts/ThemeContext';
import { getListing, updateListing } from '../../../src/services/listings';
import { ApiError } from '../../../src/services/api';

const CONDITIONS = [
  { value: 'NEW_WITH_TAGS', label: 'Novo com etiqueta' },
  { value: 'NEW_WITHOUT_TAGS', label: 'Novo sem etiqueta' },
  { value: 'VERY_GOOD', label: 'Excelente' },
  { value: 'GOOD', label: 'Bom' },
  { value: 'SATISFACTORY', label: 'Satisfatório' },
];

type Status = 'ACTIVE' | 'PAUSED' | 'SOLD';

export default function EditListingScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { id: listingId } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [condition, setCondition] = useState<string>('GOOD');
  const [size, setSize] = useState<string>('');
  const [status, setStatus] = useState<Status>('ACTIVE');

  useEffect(() => {
    if (!listingId) return;
    (async () => {
      try {
        const listing = await getListing(listingId);
        setTitle(listing.title);
        setDescription(listing.description);
        setPriceStr(listing.priceBrl.toFixed(2).replace('.', ','));
        setCondition(listing.condition);
        setSize(listing.size ?? '');
      } catch (err) {
        const msg = err instanceof ApiError && err.message ? err.message : 'Não foi possível carregar o anúncio.';
        Alert.alert('Erro', msg, [{ text: 'OK', onPress: () => router.back() }]);
      } finally {
        setLoading(false);
      }
    })();
  }, [listingId, router]);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Erro', 'O título é obrigatório.');
      return;
    }
    const priceNum = parseFloat(priceStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(priceNum) || priceNum < 1 || priceNum > 999999) {
      Alert.alert('Erro', 'Informe um preço válido entre R$ 1 e R$ 999.999.');
      return;
    }
    if (!listingId) return;

    setSaving(true);
    try {
      await updateListing(listingId, {
        title: title.trim(),
        description: description.trim(),
        priceBrl: priceNum,
        condition,
        size: size || undefined,
        status,
      });
      Alert.alert('Sucesso', 'Anúncio atualizado.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      const msg = err instanceof ApiError && err.message ? err.message : 'Não foi possível salvar.';
      Alert.alert('Erro', msg);
    } finally {
      setSaving(false);
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
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Editar anúncio' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Título</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
            value={title}
            onChangeText={setTitle}
            maxLength={200}
            accessibilityLabel="Título do anúncio"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Descrição</Text>
          <TextInput
            style={[styles.input, styles.textarea, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
            maxLength={10000}
            accessibilityLabel="Descrição do anúncio"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Preço (R$)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
            value={priceStr}
            onChangeText={setPriceStr}
            placeholder="0,00"
            placeholderTextColor={theme.textTertiary}
            keyboardType="decimal-pad"
            accessibilityLabel="Preço"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Tamanho (opcional)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
            value={size}
            onChangeText={setSize}
            maxLength={10}
            accessibilityLabel="Tamanho"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Condição</Text>
          <View style={styles.chipWrap}>
            {CONDITIONS.map((c) => (
              <TouchableOpacity
                key={c.value}
                style={[
                  styles.chip,
                  { backgroundColor: theme.inputBg, borderColor: theme.border },
                  condition === c.value && styles.chipActive,
                ]}
                onPress={() => setCondition(c.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: condition === c.value }}
              >
                <Text style={[
                  styles.chipText,
                  { color: theme.textSecondary },
                  condition === c.value && styles.chipTextActive,
                ]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Status</Text>
          <View style={styles.chipWrap}>
            {([
              { value: 'ACTIVE' as Status, label: 'Ativo', icon: 'checkmark-circle-outline' as const },
              { value: 'PAUSED' as Status, label: 'Pausado', icon: 'pause-circle-outline' as const },
              { value: 'SOLD' as Status, label: 'Vendido', icon: 'cart-outline' as const },
            ]).map((s) => (
              <TouchableOpacity
                key={s.value}
                style={[
                  styles.chip,
                  { backgroundColor: theme.inputBg, borderColor: theme.border },
                  status === s.value && styles.chipActive,
                ]}
                onPress={() => setStatus(s.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: status === s.value }}
              >
                <Ionicons
                  name={s.icon}
                  size={14}
                  color={status === s.value ? colors.primary[700] : theme.textSecondary}
                  style={{ marginRight: 4 }}
                />
                <Text style={[
                  styles.chipText,
                  { color: theme.textSecondary },
                  status === s.value && styles.chipTextActive,
                ]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {status === 'SOLD' && (
            <Text style={[styles.warning, { color: colors.warning[700] }]}>
              Marcar como vendido é irreversível pela tela de edição.
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveDisabled]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Salvar alterações</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  textarea: { height: 120, paddingTop: 12 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1,
  },
  chipActive: { backgroundColor: colors.primary[50], borderColor: colors.primary[400] },
  chipText: { fontSize: 13 },
  chipTextActive: { color: colors.primary[700], fontWeight: '600' },
  warning: { fontSize: 12, marginTop: 6 },
  saveButton: {
    backgroundColor: colors.primary[500], borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  saveDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
