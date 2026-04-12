import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface ListingCardProps {
  id: string;
  title: string;
  priceBrl: number;
  imageUrl?: string;
  sellerName: string;
  sellerVerified?: boolean;
  condition?: string;
  size?: string;
  favorited?: boolean;
  onToggleFavorite?: () => void;
}

const CONDITION_LABELS: Record<string, string> = {
  NEW_WITH_TAGS: 'Novo com etiqueta',
  NEW_WITHOUT_TAGS: 'Novo',
  VERY_GOOD: 'Muito bom',
  GOOD: 'Bom',
  SATISFACTORY: 'Satisfatório',
};

export const ListingCard = React.memo(function ListingCard({
  id, title, priceBrl, imageUrl, sellerName, sellerVerified,
  condition, size, favorited, onToggleFavorite,
}: ListingCardProps) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/listing/${id}`)}
      activeOpacity={0.8}
    >
      <View style={styles.imageContainer}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} contentFit="cover" transition={200} cachePolicy="memory-disk" />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Ionicons name="image-outline" size={32} color={colors.neutral[300]} />
          </View>
        )}
        {onToggleFavorite && (
          <TouchableOpacity style={styles.heartButton} onPress={onToggleFavorite}>
            <Ionicons
              name={favorited ? 'heart' : 'heart-outline'}
              size={22}
              color={favorited ? colors.error[500] : colors.neutral[0]}
            />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.price}>
          R$ {priceBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </Text>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>

        <View style={styles.meta}>
          {size && <Text style={styles.tag}>{size}</Text>}
          {condition && <Text style={styles.tag}>{CONDITION_LABELS[condition] ?? condition}</Text>}
        </View>

        <View style={styles.seller}>
          <Text style={styles.sellerName} numberOfLines={1}>{sellerName}</Text>
          {sellerVerified && (
            <Ionicons name="checkmark-circle" size={14} color={colors.primary[500]} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    width: '48%',
    marginBottom: 16,
    backgroundColor: colors.neutral[0],
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  imageContainer: { position: 'relative' },
  image: {
    width: '100%',
    aspectRatio: 4 / 5,
    backgroundColor: colors.neutral[100],
  },
  placeholder: { justifyContent: 'center', alignItems: 'center' },
  heartButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { padding: 8 },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.neutral[900],
  },
  title: {
    fontSize: 13,
    color: colors.neutral[600],
    marginTop: 2,
    lineHeight: 18,
  },
  meta: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  tag: {
    fontSize: 11,
    color: colors.neutral[500],
    backgroundColor: colors.neutral[100],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  seller: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  sellerName: {
    fontSize: 12,
    color: colors.neutral[400],
    flex: 1,
  },
});
