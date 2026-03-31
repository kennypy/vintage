import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';

const PLANS = [
  { name: '1 dia', price: 'R$ 4,90', highlight: false },
  { name: '3 dias', price: 'R$ 9,90', highlight: true, tag: 'Mais popular' },
  { name: '7 dias', price: 'R$ 19,90', highlight: false },
];

export default function BoostScreen() {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Ionicons name="rocket" size={48} color={colors.primary[600]} />
        </View>
        <Text style={styles.title}>Impulsionar anúncio</Text>
        <Text style={styles.subtitle}>
          Apareça no topo das buscas e receba muito mais visitas
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Escolha o plano</Text>
        {PLANS.map((plan) => (
          <TouchableOpacity
            key={plan.name}
            style={[styles.planCard, plan.highlight && styles.planCardHighlight]}
          >
            <View style={styles.planLeft}>
              <Text style={[styles.planName, plan.highlight && styles.planNameHighlight]}>
                {plan.name}
              </Text>
              {plan.tag && (
                <View style={styles.planTag}>
                  <Text style={styles.planTagText}>{plan.tag}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.planPrice, plan.highlight && styles.planPriceHighlight]}>
              {plan.price}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>O que você ganha</Text>
        {[
          'Posição de destaque nas buscas',
          'Selo "Impulsionado" no anúncio',
          'Relatório de desempenho',
          'Mais visualizações garantidas',
        ].map((benefit) => (
          <View key={benefit} style={styles.benefit}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success[500]} />
            <Text style={styles.benefitText}>{benefit}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.ctaButton}>
        <Text style={styles.ctaText}>Escolher anúncio para impulsionar</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  hero: { alignItems: 'center', padding: 32, backgroundColor: colors.neutral[0] },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.primary[50], justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 26, fontWeight: '700', color: colors.neutral[900] },
  subtitle: { fontSize: 15, color: colors.neutral[500], textAlign: 'center', marginTop: 12, lineHeight: 22 },
  section: { backgroundColor: colors.neutral[0], marginTop: 12, padding: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.neutral[900], marginBottom: 16 },
  planCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: colors.neutral[200], borderRadius: 12,
    padding: 16, marginBottom: 10, backgroundColor: colors.neutral[0],
  },
  planCardHighlight: {
    borderColor: colors.primary[500], backgroundColor: colors.primary[50],
  },
  planLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planName: { fontSize: 16, fontWeight: '600', color: colors.neutral[800] },
  planNameHighlight: { color: colors.primary[700] },
  planTag: {
    backgroundColor: colors.primary[500], paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
  },
  planTagText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  planPrice: { fontSize: 16, fontWeight: '700', color: colors.neutral[900] },
  planPriceHighlight: { color: colors.primary[600] },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  benefitText: { fontSize: 14, color: colors.neutral[700] },
  ctaButton: {
    margin: 20, backgroundColor: colors.primary[600],
    paddingVertical: 16, borderRadius: 12, alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
