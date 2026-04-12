import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
  ActivityIndicator, Image,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { getOrder } from '../../src/services/orders';
import type { Order } from '../../src/services/orders';
import { createDispute } from '../../src/services/disputes';
import type { DisputeReason } from '../../src/services/disputes';

const REASONS: { value: DisputeReason; label: string }[] = [
  { value: 'NOT_RECEIVED', label: 'Item n\u00e3o recebido' },
  { value: 'NOT_AS_DESCRIBED', label: 'Item diferente do an\u00fancio' },
  { value: 'DAMAGED', label: 'Item danificado' },
  { value: 'WRONG_ITEM', label: 'Item errado' },
  { value: 'COUNTERFEIT', label: 'Outro' },
];

const MIN_DESCRIPTION_LENGTH = 20;
const MAX_DESCRIPTION_LENGTH = 1000;

const formatBrl = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DisputeScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedReason, setSelectedReason] = useState<DisputeReason | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    async function fetchOrder() {
      try {
        const data = await getOrder(orderId ?? '');
        setOrder(data);
      } catch (_error) {
        Alert.alert('Erro', 'N\u00e3o foi poss\u00edvel carregar o pedido.');
        router.back();
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [orderId, router]);

  const handleAddPhoto = () => {
    Alert.alert('Adicionar foto', 'Escolha a origem da foto', [
      {
        text: 'C\u00e2mera',
        onPress: () => pickPhoto(true),
      },
      {
        text: 'Galeria',
        onPress: () => pickPhoto(false),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const pickPhoto = async (useCamera: boolean) => {
    if (useCamera) {
      const camPerm = await ImagePicker.requestCameraPermissionsAsync();
      if (!camPerm.granted) {
        Alert.alert('Permiss\u00e3o necess\u00e1ria', 'Precisamos de acesso \u00e0 c\u00e2mera para tirar fotos.');
        return;
      }
    } else {
      const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!libPerm.granted) {
        Alert.alert('Permiss\u00e3o necess\u00e1ria', 'Precisamos de acesso \u00e0 sua galeria para adicionar fotos.');
        return;
      }
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaType.Images,
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaType.Images,
          allowsMultipleSelection: true,
          selectionLimit: 5 - photos.length,
          quality: 0.8,
        });

    if (!result.canceled && result.assets) {
      const newUris = result.assets.map((a) => a.uri);
      setPhotos((prev) => [...prev, ...newUris].slice(0, 5));
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!selectedReason) {
      Alert.alert('Motivo obrigat\u00f3rio', 'Selecione o motivo da disputa.');
      return;
    }
    if (description.trim().length < MIN_DESCRIPTION_LENGTH) {
      Alert.alert(
        'Descri\u00e7\u00e3o muito curta',
        `A descri\u00e7\u00e3o deve ter pelo menos ${MIN_DESCRIPTION_LENGTH} caracteres.`,
      );
      return;
    }
    if (!orderId) return;

    setSubmitting(true);
    try {
      await createDispute({
        orderId,
        reason: selectedReason,
        description: description.trim(),
      });
      Alert.alert(
        'Disputa aberta',
        'Sua disputa foi registrada com sucesso. Nossa equipe analisar\u00e1 o caso.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ],
      );
    } catch (_error) {
      Alert.alert('Erro', 'N\u00e3o foi poss\u00edvel abrir a disputa. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !order) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  const isDescriptionValid = description.trim().length >= MIN_DESCRIPTION_LENGTH;
  const canSubmit = selectedReason !== null && isDescriptionValid && !submitting;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Order Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Resumo do pedido</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Pedido</Text>
          <Text style={styles.detailValue}>#{order.id.slice(0, 8)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Item</Text>
          <Text style={styles.detailValue}>{order.item.title}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Vendedor</Text>
          <Text style={styles.detailValue}>{order.seller?.name ?? '-'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Total</Text>
          <Text style={styles.detailValueBold}>R$ {formatBrl(order.totalBrl)}</Text>
        </View>
      </View>

      {/* Reason Picker */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Motivo da disputa</Text>
        {REASONS.map((reason) => (
          <TouchableOpacity
            key={reason.value}
            style={[
              styles.reasonOption,
              selectedReason === reason.value && styles.reasonOptionSelected,
            ]}
            onPress={() => setSelectedReason(reason.value)}
          >
            <View style={[
              styles.radioOuter,
              selectedReason === reason.value && styles.radioOuterSelected,
            ]}>
              {selectedReason === reason.value && <View style={styles.radioInner} />}
            </View>
            <Text style={[
              styles.reasonLabel,
              selectedReason === reason.value && styles.reasonLabelSelected,
            ]}>
              {reason.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Description */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Descreva o problema</Text>
        <TextInput
          style={styles.textArea}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          placeholder="Descreva com detalhes o que aconteceu (m\u00ednimo 20 caracteres)..."
          placeholderTextColor={colors.neutral[400]}
          value={description}
          onChangeText={(text) => setDescription(text.slice(0, MAX_DESCRIPTION_LENGTH))}
        />
        <Text style={[
          styles.charCount,
          !isDescriptionValid && description.length > 0 && styles.charCountWarning,
        ]}>
          {description.trim().length}/{MAX_DESCRIPTION_LENGTH} caracteres
          {description.length > 0 && !isDescriptionValid
            ? ` (m\u00ednimo ${MIN_DESCRIPTION_LENGTH})`
            : ''}
        </Text>
      </View>

      {/* Photo Evidence */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fotos de evid\u00eancia (opcional)</Text>
        <Text style={styles.helperText}>
          Adicione fotos que mostrem o problema com o item recebido.
        </Text>
        <View style={styles.photosRow}>
          {photos.map((uri, index) => (
            <View key={uri} style={styles.photoWrapper}>
              <Image source={{ uri }} style={styles.photoThumb} />
              <TouchableOpacity
                style={styles.removePhoto}
                onPress={() => removePhoto(index)}
              >
                <Ionicons name="close-circle" size={22} color={colors.error[500]} />
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 5 && (
            <TouchableOpacity style={styles.addPhotoButton} onPress={handleAddPhoto}>
              <Ionicons name="camera-outline" size={28} color={colors.neutral[400]} />
              <Text style={styles.addPhotoText}>Foto</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
      >
        {submitting ? (
          <ActivityIndicator color={colors.neutral[0]} />
        ) : (
          <>
            <Ionicons name="shield-outline" size={20} color={colors.neutral[0]} />
            <Text style={styles.submitButtonText}>Abrir disputa</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  centered: { justifyContent: 'center', alignItems: 'center' },
  section: {
    backgroundColor: colors.neutral[0],
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.neutral[900],
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  detailLabel: { fontSize: 14, color: colors.neutral[500] },
  detailValue: { fontSize: 14, color: colors.neutral[800], fontWeight: '500', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  detailValueBold: { fontSize: 14, color: colors.primary[600], fontWeight: '700' },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  reasonOptionSelected: {
    borderColor: colors.primary[500],
    backgroundColor: colors.primary[50],
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.neutral[300],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  radioOuterSelected: {
    borderColor: colors.primary[500],
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary[500],
  },
  reasonLabel: {
    fontSize: 14,
    color: colors.neutral[700],
  },
  reasonLabelSelected: {
    color: colors.primary[700],
    fontWeight: '600',
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.neutral[800],
    minHeight: 120,
    backgroundColor: colors.neutral[50],
  },
  charCount: {
    fontSize: 12,
    color: colors.neutral[400],
    textAlign: 'right',
    marginTop: 4,
  },
  charCountWarning: {
    color: colors.warning[600],
  },
  helperText: {
    fontSize: 13,
    color: colors.neutral[500],
    marginBottom: 12,
  },
  photosRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoWrapper: {
    position: 'relative',
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: colors.neutral[100],
  },
  removePhoto: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.neutral[0],
    borderRadius: 11,
  },
  addPhotoButton: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.neutral[300],
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPhotoText: {
    fontSize: 11,
    color: colors.neutral[400],
    marginTop: 2,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    margin: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.error[500],
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.neutral[0],
    fontSize: 15,
    fontWeight: '600',
  },
});
