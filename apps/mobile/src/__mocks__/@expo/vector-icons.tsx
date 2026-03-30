import React from 'react';
import { Text } from 'react-native';

function createMockIcon(name: string) {
  const Icon = (props: Record<string, unknown>) => (
    <Text testID={`icon-${name}`}>{String(props.name || name)}</Text>
  );
  Icon.displayName = name;
  Icon.glyphMap = new Proxy({}, { get: (_t, p) => p });
  return Icon;
}

export const Ionicons = createMockIcon('Ionicons');
export const MaterialIcons = createMockIcon('MaterialIcons');
export const FontAwesome = createMockIcon('FontAwesome');
export default createMockIcon('Icon');
