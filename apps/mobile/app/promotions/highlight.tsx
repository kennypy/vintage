import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';

export default function HighlightScreen() {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Ionicons name="sparkles" size={48} color={colors.warning[500]} />
        </View>
        <Text style={styles.title}>Destaque da loja</Text>
        <Text style={styles.subtitle}>
          Torne seu perfil um destaque e atraia muito mais compradores para sua loja
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Benefícios exclusivos</Text>
        {[
          { icon: 'star', text: 'Selo de loja em destaque no perfil' },
          { icon: 'trending-up', text: 'Seus anúncios aparecem antes dos demais' },
          { icon: 'notifications', text: 'Notificações para seus seguidores sobre novos anúncios' },
          { icon: 'analytics', text: 'Estatísticas avançadas da sua loja' },
          { icon: 'ribbon', text: 'Banner personalizado no seu perfil' },
        ].map((item) => (
          <View key={item.text} style={styles.benefit}>
            <View style={styles.benefitIcon}>
              <Ionicons name={item.icon as any} size={20} color={colors.warning[600]} />
            </View>
            <Text style={styles.benefitText}>{item.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.priceRow}>
          <View>
            <Text style={styles.priceLabel}>Por apenas</Text>
            <Text style={styles.price}>R$ 29,90<Text style={styles.pricePer}>/mês</Text></Text>
          </View>
          <TouchableOpacity style={styles.ctaButton}>
            <Text style={styles.ctaText}>Ativar destaque</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.cancelNote}>Cancele a qualquer momento</Text>
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
    backgroundColor: colors.warning[50], justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 26, fontWeight: '700', color: colors.neutral[900] },
  subtitle: { fontSize: 15, color: colors.neutral[500], textAlign: 'center', marginTop: 12, lineHeight: 22 },
  section: { backgroundColor: colors.neutral[0], marginTop: 12, padding: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.neutral[900], marginBottom: 16 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  benefitIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.warning[50], justifyContent: 'center', alignItems: 'center',
  },
  benefitText: { flex: 1, fontSize: 14, color: colors.neutral[700], lineHeight: 20 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceLabel: { fontSize: 13, color: colors.neutral[500] },
  price: { fontSize: 28, fontWeight: '800', color: colors.neutral[900], marginTop: 2 },
  pricePer: { fontSize: 15, fontWeight: '400', color: colors.neutral[500] },
  ctaButton: {
    backgroundColor: colors.warning[500], paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelNote: { fontSize: 12, color: colors.neutral[400], marginTop: 12, textAlign: 'center' },
});
