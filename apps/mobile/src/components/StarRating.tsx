import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface StarRatingProps {
  rating: number;
  size?: number;
  interactive?: boolean;
  onRate?: (rating: number) => void;
}

export function StarRating({ rating, size = 20, interactive = false, onRate }: StarRatingProps) {
  const stars = [1, 2, 3, 4, 5];

  return (
    <View style={styles.container}>
      {stars.map((star) => {
        const filled = star <= rating;
        const iconName = filled ? 'star' : 'star-outline';

        if (interactive && onRate) {
          return (
            <TouchableOpacity
              key={star}
              onPress={() => onRate(star)}
              style={styles.starButton}
            >
              <Ionicons
                name={iconName}
                size={size}
                color={filled ? colors.warning[500] : colors.neutral[300]}
              />
            </TouchableOpacity>
          );
        }

        return (
          <Ionicons
            key={star}
            name={iconName}
            size={size}
            color={filled ? colors.warning[500] : colors.neutral[300]}
            style={styles.star}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    marginRight: 2,
  },
  starButton: {
    padding: 4,
  },
});
