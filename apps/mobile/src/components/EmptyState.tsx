import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={64} color={colors.neutral[300]} />
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.button} onPress={onAction}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.neutral[700],
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.neutral[500],
    marginTop: 8,
    textAlign: 'center',
  },
  button: {
    marginTop: 20,
    backgroundColor: colors.primary[500],
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
