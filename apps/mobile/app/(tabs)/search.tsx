import { View, Text, StyleSheet, TextInput } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';

export default function SearchScreen() {
  const [query, setQuery] = useState('');

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={colors.neutral[400]} />
        <TextInput
          style={styles.input}
          placeholder="Buscar roupas, marcas, estilos..."
          placeholderTextColor={colors.neutral[400]}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
      </View>
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Busque por categorias, marcas ou estilos</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral[100],
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 44,
  },
  input: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: colors.neutral[900],
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.neutral[400],
  },
});
