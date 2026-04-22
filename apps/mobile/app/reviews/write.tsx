import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ScrollView,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { StarRating } from '../../src/components/StarRating';
import { submitReview, uploadReviewImage } from '../../src/services/reviews';

const MAX_PHOTOS = 4;

interface Photo {
  uri: string;
  url?: string;
  uploading: boolean;
  error?: boolean;
}

export default function WriteReviewScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const pickImages = async () => {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert('Limite de fotos', `Você pode anexar até ${MAX_PHOTOS} fotos.`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão negada', 'Dê acesso à galeria para anexar fotos.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
    });
    if (res.canceled) return;

    for (const asset of res.assets) {
      const entry: Photo = { uri: asset.uri, uploading: true };
      setPhotos((p) => [...p, entry]);
      try {
        const url = await uploadReviewImage(asset.uri);
        setPhotos((p) =>
          p.map((ph) => (ph.uri === asset.uri ? { ...ph, url, uploading: false } : ph)),
        );
      } catch {
        setPhotos((p) =>
          p.map((ph) => (ph.uri === asset.uri ? { ...ph, uploading: false, error: true } : ph)),
        );
      }
    }
  };

  const removePhoto = (uri: string) => {
    setPhotos((p) => p.filter((ph) => ph.uri !== uri));
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Erro', 'Selecione uma avaliação de 1 a 5 estrelas.');
      return;
    }
    if (!orderId) {
      Alert.alert('Erro', 'Pedido não encontrado.');
      return;
    }
    if (photos.some((p) => p.uploading)) {
      Alert.alert('Aguarde', 'As fotos ainda estão sendo enviadas.');
      return;
    }

    const imageUrls = photos.map((p) => p.url).filter((u): u is string => !!u);

    setSubmitting(true);
    try {
      await submitReview(orderId, rating, comment.trim() || undefined, imageUrls);
      Alert.alert('Sucesso', 'Avaliação enviada com sucesso!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (_error) {
      Alert.alert('Erro', 'Não foi possível enviar a avaliação.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Como foi sua experiência?</Text>
        <Text style={styles.subtitle}>
          Sua avaliação ajuda outras pessoas a tomar decisões melhores.
        </Text>

        <View style={styles.ratingSection}>
          <Text style={styles.ratingLabel}>Avaliação</Text>
          <StarRating
            rating={rating}
            size={40}
            interactive
            onRate={setRating}
          />
          <Text style={styles.ratingHint}>
            {rating === 0 && 'Toque nas estrelas para avaliar'}
            {rating === 1 && 'Muito ruim'}
            {rating === 2 && 'Ruim'}
            {rating === 3 && 'Regular'}
            {rating === 4 && 'Bom'}
            {rating === 5 && 'Excelente'}
          </Text>
        </View>

        <View style={styles.commentSection}>
          <Text style={styles.commentLabel}>Comentário (opcional)</Text>
          <TextInput
            style={styles.textArea}
            value={comment}
            onChangeText={setComment}
            placeholder="Conte como foi sua experiência..."
            placeholderTextColor={colors.neutral[400]}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{comment.length}/500</Text>
        </View>

        <View style={styles.photosSection}>
          <Text style={styles.commentLabel}>Fotos (opcional, máx {MAX_PHOTOS})</Text>
          <View style={styles.photosRow}>
            {photos.map((p) => (
              <View key={p.uri} style={styles.photo}>
                <Image source={{ uri: p.uri }} style={styles.photoImg} />
                {p.uploading && (
                  <View style={styles.photoOverlay}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
                {p.error && (
                  <View style={[styles.photoOverlay, { backgroundColor: 'rgba(200,0,0,0.6)' }]}>
                    <Text style={styles.photoErr}>Erro</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(p.uri)}>
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <TouchableOpacity style={styles.photoAdd} onPress={pickImages}>
                <Ionicons name="camera-outline" size={24} color={colors.neutral[500]} />
                <Text style={styles.photoAddText}>Adicionar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, (rating === 0 || submitting) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={rating === 0 || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitButtonText}>Enviar avaliação</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24 },
  title: { fontSize: 22, fontWeight: '700', color: colors.neutral[900], textAlign: 'center' },
  subtitle: {
    fontSize: 14,
    color: colors.neutral[500],
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  ratingSection: { alignItems: 'center', marginBottom: 32 },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.neutral[700],
    marginBottom: 12,
  },
  ratingHint: { fontSize: 14, color: colors.neutral[500], marginTop: 8 },
  commentSection: { marginBottom: 24 },
  commentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.neutral[700],
    marginBottom: 8,
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.neutral[900],
    backgroundColor: colors.neutral[50],
    height: 120,
  },
  charCount: {
    fontSize: 12,
    color: colors.neutral[400],
    textAlign: 'right',
    marginTop: 4,
  },
  photosSection: { marginBottom: 24 },
  photosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 72, height: 72, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  photoImg: { width: '100%', height: '100%' },
  photoOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoErr: { color: '#fff', fontSize: 11 },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAdd: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.neutral[300],
    backgroundColor: colors.neutral[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddText: { fontSize: 10, color: colors.neutral[500], marginTop: 2 },
  submitButton: {
    backgroundColor: colors.primary[500],
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
