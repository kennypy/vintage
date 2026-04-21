import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/theme/colors';

/**
 * Post-signup walkthrough — the first screen a freshly-registered user
 * sees instead of the feed. Primary CTA routes to /conta/verificacao to
 * kick off Serpro identity verification; secondary CTA skips to the
 * tabs and relies on the persistent banner + reminder cron to nudge
 * them later.
 *
 * Intentionally non-blocking: skipping is a first-class action.
 * Registration itself is complete; this screen is about capturing
 * verification intent while it's fresh.
 */
export default function WelcomeVerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark" size={48} color="#fff" />
        </View>

        <Text style={styles.title}>Bem-vinda ao Vintage.br!</Text>
        <Text style={styles.subtitle}>
          Ganhe o selo <Text style={styles.bold}>CPF Verificado</Text> e comece com o pé direito.
        </Text>

        <View style={styles.benefits}>
          <Benefit icon="storefront" text="Necessário para publicar anúncios e vender" />
          <Benefit icon="wallet" text="Libera saques via PIX para sua conta" />
          <Benefit icon="ribbon" text="Aumenta a confiança dos compradores no seu perfil" />
          <Benefit icon="flash" text="Verificação em menos de 1 minuto" />
        </View>

        <TouchableOpacity
          style={styles.primary}
          onPress={() => router.replace('/conta/verificacao')}
        >
          <Text style={styles.primaryText}>Verificar CPF agora</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondary}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={styles.secondaryText}>Explorar primeiro</Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          Você pode verificar depois em Conta → Verificação. A qualquer momento.
        </Text>
      </ScrollView>
    </View>
  );
}

function Benefit({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.benefit}>
      <Ionicons name={icon} size={20} color={colors.primary[600]} />
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  scroll: { paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center' },
  iconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.primary[600],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 26, fontWeight: '700', color: colors.neutral[900],
    textAlign: 'center', marginBottom: 8,
  },
  subtitle: {
    fontSize: 16, color: colors.neutral[600],
    textAlign: 'center', marginBottom: 32, lineHeight: 22,
  },
  bold: { fontWeight: '700', color: colors.neutral[900] },
  benefits: { width: '100%', gap: 14, marginBottom: 32 },
  benefit: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.neutral[0],
    padding: 14, borderRadius: 10,
  },
  benefitText: { flex: 1, color: colors.neutral[800], fontSize: 14 },
  primary: {
    width: '100%',
    backgroundColor: colors.primary[600],
    paddingVertical: 16, borderRadius: 10,
    alignItems: 'center', marginBottom: 12,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: {
    width: '100%',
    paddingVertical: 14, borderRadius: 10,
    alignItems: 'center', marginBottom: 20,
  },
  secondaryText: { color: colors.neutral[700], fontSize: 15, fontWeight: '600' },
  note: { fontSize: 12, color: colors.neutral[500], textAlign: 'center' },
});
