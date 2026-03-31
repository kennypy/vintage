import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert,
  Image, ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { createListing } from '../../src/services/listings';
import { addDemoListing, DEMO_PHOTOS } from '../../src/services/demoStore';
import { useAuth } from '../../src/contexts/AuthContext';

const CONDITIONS = [
  { value: 'NEW_WITH_TAGS', label: 'Novo com etiqueta' },
  { value: 'NEW_WITHOUT_TAGS', label: 'Novo sem etiqueta' },
  { value: 'VERY_GOOD', label: 'Excelente' },
  { value: 'GOOD', label: 'Bom' },
  { value: 'SATISFACTORY', label: 'Satisfatório' },
];

const CLOTHING_SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG'];
const SHOE_SIZES = ['33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'];
const KIDS_CLOTHING_SIZES = ['0-3m', '3-6m', '6-12m', '1A', '2A', '3A', '4A', '5A', '6A', '8A', '10A', '12A'];

// Categories that require size selection and which size type they use
const SIZE_CATEGORY_MAP: Record<string, 'clothing' | 'shoes' | 'kids'> = {
  feminino: 'clothing',
  masculino: 'clothing',
  kids: 'kids',
  esportes: 'clothing',
};

// Sub-categories that switch to shoe sizes
const SHOE_SUBCATEGORIES = new Set(['Calçados']);

const CATEGORIES: { id: string; label: string; icon: string; sub: string[] }[] = [
  {
    id: 'feminino', label: 'Feminino', icon: 'woman-outline',
    sub: ['Tops e blusas', 'Vestidos', 'Calças', 'Saias', 'Casacos', 'Calçados', 'Bolsas', 'Acessórios', 'Moda praia', 'Lingerie'],
  },
  {
    id: 'masculino', label: 'Masculino', icon: 'man-outline',
    sub: ['Camisetas', 'Camisas', 'Calças', 'Casacos', 'Ternos', 'Calçados', 'Bolsas', 'Acessórios', 'Esportivo'],
  },
  {
    id: 'kids', label: 'Infantil', icon: 'happy-outline',
    sub: ['Bebê (0-2 anos)', 'Criança pequena (2-5)', 'Criança (5-12)', 'Calçados', 'Acessórios'],
  },
  {
    id: 'casa', label: 'Casa', icon: 'home-outline',
    sub: ['Móveis', 'Decoração', 'Cozinha', 'Banheiro', 'Jardim', 'Iluminação', 'Arte'],
  },
  {
    id: 'eletronicos', label: 'Eletrônicos', icon: 'phone-portrait-outline',
    sub: ['Celulares', 'Computadores', 'Tablets', 'Áudio', 'Games', 'Câmeras', 'Acessórios'],
  },
  {
    id: 'entretenimento', label: 'Entretenimento', icon: 'musical-notes-outline',
    sub: ['Livros', 'Música', 'Filmes', 'Jogos', 'Instrumentos'],
  },
  {
    id: 'hobbies', label: 'Hobbies & Colecionáveis', icon: 'color-palette-outline',
    sub: ['Material artístico', 'Artesanato', 'Colecionáveis', 'Miniaturas', 'Vintage', 'Cards'],
  },
  {
    id: 'esportes', label: 'Esportes', icon: 'bicycle-outline',
    sub: ['Fitness', 'Corrida', 'Natação', 'Ciclismo', 'Esportes coletivos', 'Outdoor', 'Yoga'],
  },
];

export default function SellScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [photos, setPhotos] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState('');
  const [size, setSize] = useState('');
  const [brand, setBrand] = useState('');
  const [weight, setWeight] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubCategory, setSelectedSubCategory] = useState('');
  const [publishing, setPublishing] = useState(false);

  const showSizeSelector = selectedCategory !== '' && SIZE_CATEGORY_MAP[selectedCategory] !== undefined;
  const currentSizes = showSizeSelector
    ? SHOE_SUBCATEGORIES.has(selectedSubCategory)
      ? SHOE_SIZES
      : SIZE_CATEGORY_MAP[selectedCategory] === 'kids'
        ? KIDS_CLOTHING_SIZES
        : CLOTHING_SIZES
    : [];

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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
          category: selectedSubCategory || selectedCategory,
          imageIds: [],
        });
        listingId = listing.id;
      } catch (_apiError) {
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
          category: selectedSubCategory || selectedCategory || 'Outros',
          color: undefined,
          images: photoUrls.map((url, i) => ({ id: `img-${i}`, url, order: i })),
          seller: { id: user?.id ?? 'demo-user', name: user?.name ?? 'Você (Demo)' },
          isFavorited: false,
          viewCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        listingId = demoId;
      }

      setPhotos([]);
      setTitle('');
      setDescription('');
      setPrice('');
      setCondition('');
      setSize('');
      setBrand('');
      setWeight('');
      setSelectedCategory('');
      setSelectedSubCategory('');

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
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
      {/* Photos */}
      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Fotos (até 20)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
          <TouchableOpacity style={styles.addPhoto} onPress={handleAddPhoto}>
            <Ionicons name="camera" size={32} color={colors.primary[500]} />
            <Text style={styles.addPhotoText}>Adicionar</Text>
          </TouchableOpacity>
          {photos.map((uri, i) => (
            <View key={i} style={[styles.photoThumb, { backgroundColor: theme.inputBg }]}>
              <Image source={{ uri }} style={styles.photoImage} />
              <TouchableOpacity style={[styles.removePhoto, { backgroundColor: theme.card }]} onPress={() => removePhoto(i)}>
                <Ionicons name="close-circle" size={22} color={colors.error[500]} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Title */}
      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Título *</Text>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
          placeholder="Ex: Vestido Zara preto tamanho M"
          placeholderTextColor={theme.textTertiary}
          value={title}
          onChangeText={setTitle}
          maxLength={200}
        />
      </View>

      {/* Description */}
      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Descrição *</Text>
        <TextInput
          style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
          placeholder="Descreva o item, defeitos, medidas..."
          placeholderTextColor={theme.textTertiary}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          maxLength={2000}
        />
      </View>

      {/* Category */}
      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Categoria</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryCard,
                { borderColor: theme.border, backgroundColor: theme.inputBg },
                selectedCategory === cat.id && { borderColor: colors.primary[500], backgroundColor: theme.isDark ? colors.primary[900] + '40' : colors.primary[50] },
              ]}
              onPress={() => {
                if (selectedCategory === cat.id) {
                  setSelectedCategory('');
                  setSelectedSubCategory('');
                  setSize('');
                } else {
                  setSelectedCategory(cat.id);
                  setSelectedSubCategory('');
                  setSize('');
                }
              }}
            >
              <Ionicons
                name={cat.icon as 'home-outline'}
                size={22}
                color={selectedCategory === cat.id ? colors.primary[600] : theme.textSecondary}
              />
              <Text style={[
                styles.categoryCardText,
                { color: selectedCategory === cat.id ? colors.primary[600] : theme.text },
              ]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sub-categories — shown only after a top-level category is selected */}
        {selectedCategory !== '' && (
          <View style={styles.subSection}>
            <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Sub-categoria</Text>
            <View style={styles.chipGroup}>
              {CATEGORIES.find((c) => c.id === selectedCategory)?.sub.map((sub) => (
                <TouchableOpacity
                  key={sub}
                  style={[
                    styles.chip,
                    { borderColor: theme.border, backgroundColor: theme.inputBg },
                    selectedSubCategory === sub && styles.chipSelected,
                  ]}
                  onPress={() => setSelectedSubCategory(selectedSubCategory === sub ? '' : sub)}
                >
                  <Text style={[
                    styles.chipText,
                    { color: theme.textSecondary },
                    selectedSubCategory === sub && styles.chipTextSelected,
                  ]}>
                    {sub}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Condition */}
      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Condição *</Text>
        <View style={styles.chipGroup}>
          {CONDITIONS.map((c) => (
            <TouchableOpacity
              key={c.value}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: theme.inputBg }, condition === c.value && styles.chipSelected]}
              onPress={() => setCondition(c.value)}
            >
              <Text style={[styles.chipText, { color: theme.textSecondary }, condition === c.value && styles.chipTextSelected]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Size — only for clothing/shoes/kids categories */}
      {showSizeSelector && (
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Tamanho</Text>
          <View style={styles.chipGroup}>
            {currentSizes.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.sizeChip, { borderColor: theme.border, backgroundColor: theme.inputBg }, size === s && styles.chipSelected]}
                onPress={() => setSize(size === s ? '' : s)}
              >
                <Text style={[styles.chipText, { color: theme.textSecondary }, size === s && styles.chipTextSelected]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Brand */}
      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Marca</Text>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
          placeholder="Ex: Zara, Farm, Nike..."
          placeholderTextColor={theme.textTertiary}
          value={brand}
          onChangeText={setBrand}
        />
      </View>

      {/* Price */}
      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Preço (R$) *</Text>
        <View style={styles.priceRow}>
          <Text style={[styles.pricePrefix, { color: theme.textSecondary }]}>R$</Text>
          <TextInput
            style={[styles.input, styles.priceInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
            placeholder="0,00"
            placeholderTextColor={theme.textTertiary}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
        </View>
        <Text style={styles.hint}>Sem taxas! Você recebe 100% do valor.</Text>
      </View>

      {/* Weight */}
      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Peso estimado (gramas)</Text>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
          placeholder="Ex: 300"
          placeholderTextColor={theme.textTertiary}
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
  container: { flex: 1 },
  section: { padding: 16, marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  photoRow: { flexDirection: 'row' },
  addPhoto: {
    width: 90, height: 90, borderRadius: 10, borderWidth: 2, borderColor: colors.primary[200],
    borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  addPhotoText: { fontSize: 11, color: colors.primary[500], marginTop: 4 },
  photoThumb: {
    width: 90, height: 90, borderRadius: 10,
    marginRight: 10, position: 'relative', overflow: 'hidden',
  },
  photoImage: { width: 90, height: 90, borderRadius: 10 },
  removePhoto: {
    position: 'absolute', top: 2, right: 2, borderRadius: 11,
  },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryCard: {
    width: '47%', paddingVertical: 12, paddingHorizontal: 10,
    borderRadius: 10, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  categoryCardText: { fontSize: 13, fontWeight: '500', flex: 1 },
  subSection: { marginTop: 14 },
  subLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  chipSelected: { borderColor: colors.primary[500], backgroundColor: colors.primary[50] },
  chipText: { fontSize: 13 },
  chipTextSelected: { color: colors.primary[600], fontWeight: '600' },
  sizeChip: {
    minWidth: 44, height: 36, borderRadius: 18, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center' },
  pricePrefix: { fontSize: 18, fontWeight: '600', marginRight: 8 },
  priceInput: { flex: 1 },
  hint: { fontSize: 12, color: colors.success[600], marginTop: 6 },
  publishButton: {
    margin: 16, backgroundColor: colors.primary[600], paddingVertical: 16,
    borderRadius: 12, alignItems: 'center',
  },
  publishDisabled: { opacity: 0.6 },
  publishText: { color: colors.neutral[0], fontSize: 16, fontWeight: '600' },
});
