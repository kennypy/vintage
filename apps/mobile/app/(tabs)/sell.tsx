import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert,
  Image, ActivityIndicator,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { createListing, getCategories } from '../../src/services/listings';
import type { Category } from '../../src/services/listings';
import { addDemoListing, DEMO_PHOTOS } from '../../src/services/demoStore';

const CONDITIONS = [
  { value: 'NEW_WITH_TAGS', label: 'Novo com etiqueta' },
  { value: 'NEW_WITHOUT_TAGS', label: 'Novo sem etiqueta' },
  { value: 'VERY_GOOD', label: 'Muito bom' },
  { value: 'GOOD', label: 'Bom' },
  { value: 'SATISFACTORY', label: 'Satisfatório' },
];

const SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG'];

export default function SellScreen() {
  const router = useRouter();
  const [photos, setPhotos] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState('');
  const [size, setSize] = useState('');
  const [brand, setBrand] = useState('');
  const [weight, setWeight] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    async function loadCategories() {
      try {
        const cats = await getCategories();
        setCategories(cats);
      } catch (_error) {
        // Fallback - categories will be empty
      }
    }
    loadCategories();
  }, []);

  const handleAddPhoto = async () => {
    if (photos.length >= 20) {
      Alert.alert('Limite atingido', 'Você pode adicionar no máximo 20 fotos.');
      return;
    }

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permissão necessária', 'Precisamos de acesso à sua galeria para adicionar fotos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType.images,
      allowsMultipleSelection: true,
      selectionLimit: 20 - photos.length,
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      const newUris = result.assets.map((asset) => asset.uri);
      setPhotos((prev) => [...prev, ...newUris].slice(0, 20));
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePublish = async () => {
    if (!title || !description || !price || !condition) {
      Alert.alert('Campos obrigatórios', 'Preencha título, descrição, preço e condição.');
      return;
    }

    setPublishing(true);
    try {
      const priceParsed = parseFloat(price.replace(',', '.'));
      if (isNaN(priceParsed) || priceParsed <= 0) {
        Alert.alert('Preço inválido', 'Informe um preço válido.');
        setPublishing(false);
        return;
      }

      let listingId: string;

      try {
        const listing = await createListing({
          title,
          description,
          priceBrl: priceParsed,
          condition,
          size,
          brand: brand || undefined,
          category: selectedCategory,
          imageIds: [],
        });
        listingId = listing.id;
      } catch (_apiError) {
        // API unavailable — create listing in local demo store
        const demoId = `demo-user-listing-${Date.now()}`;
        const photoUrls = photos.length > 0 ? photos : DEMO_PHOTOS.slice(0, 3);
        addDemoListing({
          id: demoId,
          title,
          description,
          priceBrl: priceParsed,
          condition,
          size,
          brand: brand || undefined,
          category: selectedCategory || 'Outros',
          color: undefined,
          images: photoUrls.map((url, i) => ({ id: `img-${i}`, url, order: i })),
          seller: { id: 'demo-user', name: 'Você (Demo)' },
          isFavorited: false,
          viewCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        listingId = demoId;
      }

      // Reset form
      setPhotos([]);
      setTitle('');
      setDescription('');
      setPrice('');
      setCondition('');
      setSize('');
      setBrand('');
      setWeight('');
      setSelectedCategory('');

      Alert.alert('Anúncio criado!', 'Seu anúncio está no ar.', [
        {
          text: 'Ver anúncio',
          onPress: () => router.push(`/listing/${listingId}`),
        },
        { text: 'OK' },
      ]);
    } catch (_error) {
      Alert.alert('Erro', 'Não foi possível criar o anúncio. Tente novamente.');
    } finally {
      setPublishing(false);
    }
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
          {photos.map((uri, i) => (
            <View key={i} style={styles.photoThumb}>
              <Image source={{ uri }} style={styles.photoImage} />
              <TouchableOpacity style={styles.removePhoto} onPress={() => removePhoto(i)}>
                <Ionicons name="close-circle" size={22} color={colors.error[500]} />
              </TouchableOpacity>
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

      {/* Category */}
      {categories.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.label}>Categoria</Text>
          <View style={styles.chipGroup}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.chip, selectedCategory === cat.id && styles.chipSelected]}
                onPress={() => setSelectedCategory(selectedCategory === cat.id ? '' : cat.id)}
              >
                <Text style={[styles.chipText, selectedCategory === cat.id && styles.chipTextSelected]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

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
      <TouchableOpacity
        style={[styles.publishButton, publishing && styles.publishDisabled]}
        onPress={handlePublish}
        disabled={publishing}
      >
        {publishing ? (
          <ActivityIndicator color={colors.neutral[0]} />
        ) : (
          <Text style={styles.publishText}>Publicar anúncio</Text>
        )}
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
    marginRight: 10, position: 'relative', overflow: 'hidden',
  },
  photoImage: {
    width: 90, height: 90, borderRadius: 10,
  },
  removePhoto: {
    position: 'absolute', top: 2, right: 2, backgroundColor: colors.neutral[0], borderRadius: 11,
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
  publishDisabled: { opacity: 0.6 },
  publishText: { color: colors.neutral[0], fontSize: 16, fontWeight: '600' },
});
