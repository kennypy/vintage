import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert,
} from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';

const CONDITIONS = [
  { value: 'NEW_WITH_TAGS', label: 'Novo com etiqueta' },
  { value: 'NEW_WITHOUT_TAGS', label: 'Novo sem etiqueta' },
  { value: 'VERY_GOOD', label: 'Muito bom' },
  { value: 'GOOD', label: 'Bom' },
  { value: 'SATISFACTORY', label: 'Satisfatório' },
];

const SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG'];

export default function SellScreen() {
  const [photos, _setPhotos] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState('');
  const [size, setSize] = useState('');
  const [brand, setBrand] = useState('');
  const [weight, setWeight] = useState('');

  const handleAddPhoto = () => {
    // TODO: Use expo-image-picker or expo-camera
    Alert.alert('Adicionar foto', 'Câmera e galeria serão integradas em breve.');
  };

  const handlePublish = () => {
    if (!title || !description || !price || !condition) {
      Alert.alert('Campos obrigatórios', 'Preencha título, descrição, preço e condição.');
      return;
    }
    // TODO: Call listings API
    Alert.alert('Anúncio criado!', 'Seu anúncio está no ar.');
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Photos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fotos (até 20)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
          <TouchableOpacity style={styles.addPhoto} onPress={handleAddPhoto}>
            <Ionicons name="camera" size={32} color={colors.primary[500]} />
            <Text style={styles.addPhotoText}>Adicionar</Text>
          </TouchableOpacity>
          {photos.map((_, i) => (
            <View key={i} style={styles.photoThumb}>
              <Ionicons name="image" size={32} color={colors.neutral[400]} />
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Title */}
      <View style={styles.section}>
        <Text style={styles.label}>Título *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: Vestido Zara preto tamanho M"
          placeholderTextColor={colors.neutral[400]}
          value={title}
          onChangeText={setTitle}
          maxLength={200}
        />
      </View>

      {/* Description */}
      <View style={styles.section}>
        <Text style={styles.label}>Descrição *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Descreva o item, defeitos, medidas..."
          placeholderTextColor={colors.neutral[400]}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          maxLength={2000}
        />
      </View>

      {/* Condition */}
      <View style={styles.section}>
        <Text style={styles.label}>Condição *</Text>
        <View style={styles.chipGroup}>
          {CONDITIONS.map((c) => (
            <TouchableOpacity
              key={c.value}
              style={[styles.chip, condition === c.value && styles.chipSelected]}
              onPress={() => setCondition(c.value)}
            >
              <Text style={[styles.chipText, condition === c.value && styles.chipTextSelected]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Size */}
      <View style={styles.section}>
        <Text style={styles.label}>Tamanho</Text>
        <View style={styles.chipGroup}>
          {SIZES.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.sizeChip, size === s && styles.chipSelected]}
              onPress={() => setSize(size === s ? '' : s)}
            >
              <Text style={[styles.chipText, size === s && styles.chipTextSelected]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Brand */}
      <View style={styles.section}>
        <Text style={styles.label}>Marca</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: Zara, Farm, Nike..."
          placeholderTextColor={colors.neutral[400]}
          value={brand}
          onChangeText={setBrand}
        />
      </View>

      {/* Price */}
      <View style={styles.section}>
        <Text style={styles.label}>Preço (R$) *</Text>
        <View style={styles.priceRow}>
          <Text style={styles.pricePrefix}>R$</Text>
          <TextInput
            style={[styles.input, styles.priceInput]}
            placeholder="0,00"
            placeholderTextColor={colors.neutral[400]}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
        </View>
        <Text style={styles.hint}>Sem taxas! Você recebe 100% do valor.</Text>
      </View>

      {/* Weight */}
      <View style={styles.section}>
        <Text style={styles.label}>Peso estimado (gramas)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 300"
          placeholderTextColor={colors.neutral[400]}
          value={weight}
          onChangeText={setWeight}
          keyboardType="numeric"
        />
        <Text style={styles.hint}>Usado para calcular o frete.</Text>
      </View>

      {/* Publish */}
      <TouchableOpacity style={styles.publishButton} onPress={handlePublish}>
        <Text style={styles.publishText}>Publicar anúncio</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  section: { backgroundColor: colors.neutral[0], padding: 16, marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.neutral[900], marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', color: colors.neutral[700], marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: colors.neutral[200], borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.neutral[900],
    backgroundColor: colors.neutral[50],
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  photoRow: { flexDirection: 'row' },
  addPhoto: {
    width: 90, height: 90, borderRadius: 10, borderWidth: 2, borderColor: colors.primary[200],
    borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  addPhotoText: { fontSize: 11, color: colors.primary[500], marginTop: 4 },
  photoThumb: {
    width: 90, height: 90, borderRadius: 10, backgroundColor: colors.neutral[100],
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.neutral[50],
  },
  chipSelected: { borderColor: colors.primary[500], backgroundColor: colors.primary[50] },
  chipText: { fontSize: 13, color: colors.neutral[600] },
  chipTextSelected: { color: colors.primary[600], fontWeight: '600' },
  sizeChip: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.neutral[200],
    justifyContent: 'center', alignItems: 'center', backgroundColor: colors.neutral[50],
  },
  priceRow: { flexDirection: 'row', alignItems: 'center' },
  pricePrefix: { fontSize: 18, fontWeight: '600', color: colors.neutral[700], marginRight: 8 },
  priceInput: { flex: 1 },
  hint: { fontSize: 12, color: colors.success[600], marginTop: 6 },
  publishButton: {
    margin: 16, backgroundColor: colors.primary[600], paddingVertical: 16,
    borderRadius: 12, alignItems: 'center',
  },
  publishText: { color: colors.neutral[0], fontSize: 16, fontWeight: '600' },
});
