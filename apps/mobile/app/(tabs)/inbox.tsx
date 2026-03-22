import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../src/theme/colors';

export default function InboxScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Nenhuma mensagem</Text>
        <Text style={styles.emptyText}>
          Suas conversas com compradores e vendedores aparecerão aqui.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.neutral[900],
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.neutral[400],
    textAlign: 'center',
  },
});
