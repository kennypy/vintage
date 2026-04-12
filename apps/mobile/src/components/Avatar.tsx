import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

export interface PresetAvatar {
  id: string;
  gender: 'M' | 'F';
  tone: 'LIGHT' | 'MEDIUM_LIGHT' | 'MEDIUM' | 'DARK';
  label: string;
}

export const PRESET_AVATARS: PresetAvatar[] = [
  { id: 'F_LIGHT', gender: 'F', tone: 'LIGHT', label: 'Clara' },
  { id: 'F_MEDIUM_LIGHT', gender: 'F', tone: 'MEDIUM_LIGHT', label: 'Pele clara' },
  { id: 'F_MEDIUM', gender: 'F', tone: 'MEDIUM', label: 'Morena' },
  { id: 'F_DARK', gender: 'F', tone: 'DARK', label: 'Negra' },
  { id: 'M_LIGHT', gender: 'M', tone: 'LIGHT', label: 'Claro' },
  { id: 'M_MEDIUM_LIGHT', gender: 'M', tone: 'MEDIUM_LIGHT', label: 'Pele clara' },
  { id: 'M_MEDIUM', gender: 'M', tone: 'MEDIUM', label: 'Moreno' },
  { id: 'M_DARK', gender: 'M', tone: 'DARK', label: 'Negro' },
];

const TONE_BG: Record<string, string> = {
  LIGHT: '#FDDCC4',
  MEDIUM_LIGHT: '#E8B896',
  MEDIUM: '#C4855A',
  DARK: '#8D5524',
};

const TONE_ICON: Record<string, string> = {
  LIGHT: '#7A3300',
  MEDIUM_LIGHT: '#5C2600',
  MEDIUM: '#3E1A00',
  DARK: '#2A0E00',
};

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
}

function parsePreset(uri: string): PresetAvatar | null {
  return PRESET_AVATARS.find((p) => `preset:${p.id}` === uri) ?? null;
}

export const Avatar = React.memo(function Avatar({ uri, name, size = 48 }: AvatarProps) {
  const borderRadius = size / 2;

  if (uri?.startsWith('preset:')) {
    const preset = parsePreset(uri);
    if (preset) {
      const bg = TONE_BG[preset.tone] ?? '#d1d5db';
      const iconColor = TONE_ICON[preset.tone] ?? '#374151';
      return (
        <View style={[styles.base, { width: size, height: size, borderRadius, backgroundColor: bg }]}>
          <Ionicons name="person" size={size * 0.55} color={iconColor} />
        </View>
      );
    }
  }

  if (uri && (uri.startsWith('http') || uri.startsWith('file://'))) {
    return (
      <Image
        source={{ uri }}
        style={[styles.base, { width: size, height: size, borderRadius }]}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
      />
    );
  }

  if (name) {
    const initials = name
      .split(' ')
      .map((w) => w[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 2);
    return (
      <View style={[styles.base, styles.defaultBg, { width: size, height: size, borderRadius }]}>
        <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.base, styles.defaultBg, { width: size, height: size, borderRadius }]}>
      <Ionicons name="person" size={size * 0.55} color="#9ca3af" />
    </View>
  );
});

const styles = StyleSheet.create({
  base: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  defaultBg: {
    backgroundColor: '#f3f4f6',
  },
  initials: {
    fontWeight: '700',
    color: '#6b7280',
  },
});
