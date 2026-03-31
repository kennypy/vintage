import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';

const STEPS = [
  { id: 'cpf', label: 'CPF verificado', done: true, icon: 'card-outline' },
  { id: 'email', label: 'E-mail verificado', done: true, icon: 'mail-outline' },
  { id: 'phone', label: 'Telefone verificado', done: false, icon: 'phone-portrait-outline' },
  { id: 'id', label: 'Documento de identidade', done: false, icon: 'id-card-outline' },
];

export default function VerificacaoScreen() {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Ionicons name="shield-checkmark" size={48} color={colors.primary[600]} />
        </View>
        <Text style={styles.title}>Verificação de conta</Text>
        <Text style={styles.subtitle}>
          Contas verificadas geram mais confiança e vendem mais rápido
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Status de verificação</Text>
        {STEPS.map((step) => (
          <View key={step.id} style={styles.stepRow}>
            <View style={[styles.stepIcon, step.done && styles.stepIconDone]}>
              <Ionicons
                name={step.done ? 'checkmark' : step.icon as any}
                size={20}
                color={step.done ? '#fff' : colors.neutral[400]}
              />
            </View>
            <Text style={[styles.stepLabel, !step.done && styles.stepLabelPending]}>
              {step.label}
            </Text>
            {!step.done && (
              <TouchableOpacity style={styles.verifyButton}>
                <Text style={styles.verifyButtonText}>Verificar</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Por que verificar?</Text>
        {[
          'Transmite mais confiança para compradores',
          'Acesso a recursos exclusivos de vendedor',
          'Proteção contra fraudes',
          'Badge de verificado no perfil',
        ].map((benefit) => (
          <View key={benefit} style={styles.benefit}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success[500]} />
            <Text style={styles.benefitText}>{benefit}</Text>
          </View>
        ))}
      </View>

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
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  stepIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.neutral[100], justifyContent: 'center', alignItems: 'center',
  },
  stepIconDone: { backgroundColor: colors.success[500] },
  stepLabel: { flex: 1, fontSize: 15, color: colors.neutral[800] },
  stepLabelPending: { color: colors.neutral[500] },
  verifyButton: {
    backgroundColor: colors.primary[50], borderWidth: 1, borderColor: colors.primary[300],
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
  },
  verifyButtonText: { fontSize: 13, fontWeight: '600', color: colors.primary[600] },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  benefitText: { fontSize: 14, color: colors.neutral[700] },
});
