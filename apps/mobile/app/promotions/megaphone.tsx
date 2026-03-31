import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';

export default function MegaphoneScreen() {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Ionicons name="megaphone" size={48} color={colors.primary[600]} />
        </View>
        <Text style={styles.title}>Megafone</Text>
        <View style={styles.freeBadge}>
          <Text style={styles.freeBadgeText}>Grátis</Text>
        </View>
        <Text style={styles.subtitle}>
          Destaque seu anúncio para mais compradores e venda mais rápido!
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Como funciona</Text>
        <View style={styles.step}>
          <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
          <Text style={styles.stepText}>Escolha um anúncio para impulsionar</Text>
        </View>
        <View style={styles.step}>
          <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
          <Text style={styles.stepText}>Seu anúncio aparece no topo das buscas por 24h</Text>
        </View>
        <View style={styles.step}>
          <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
          <Text style={styles.stepText}>Receba mais visitas e venda mais rápido</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Benefícios</Text>
        {[
          'Visibilidade 10x maior',
          'Aparece primeiro nas buscas',
          'Notificação para compradores interessados',
          '1 uso grátis por mês',
        ].map((benefit) => (
          <View key={benefit} style={styles.benefit}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success[500]} />
            <Text style={styles.benefitText}>{benefit}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.ctaButton}>
        <Text style={styles.ctaText}>Usar meu Megafone grátis</Text>
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
  freeBadge: {
    backgroundColor: colors.success[500], borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 4, marginTop: 8,
  },
  freeBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  subtitle: { fontSize: 15, color: colors.neutral[500], textAlign: 'center', marginTop: 12, lineHeight: 22 },
  section: { backgroundColor: colors.neutral[0], marginTop: 12, padding: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.neutral[900], marginBottom: 16 },
  step: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  stepNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primary[500], justifyContent: 'center', alignItems: 'center',
  },
  stepNumText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  stepText: { flex: 1, fontSize: 14, color: colors.neutral[700], lineHeight: 20 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  benefitText: { fontSize: 14, color: colors.neutral[700] },
  ctaButton: {
    margin: 20, backgroundColor: colors.primary[600],
    paddingVertical: 16, borderRadius: 12, alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
