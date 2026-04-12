import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { createSpotlight } from '../../src/services/promotions';

export default function HighlightScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [activating, setActivating] = useState(false);

  const handleActivate = async () => {
    setActivating(true);
    try {
      await createSpotlight();
      Alert.alert(
        'Destaque ativado!',
        'Seu perfil agora tem o selo de loja em destaque por 7 dias.',
        [{ text: 'Ver meu perfil', onPress: () => router.push('/(tabs)/profile') }],
      );
    } catch {
      Alert.alert('Erro', 'Não foi possível ativar o destaque. Tente novamente.');
    } finally {
      setActivating(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
      <View style={[styles.hero, { backgroundColor: theme.card }]}>
        <View style={styles.iconCircle}>
          <Ionicons name="sparkles" size={48} color={colors.warning[500]} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Destaque da loja</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Torne seu perfil um destaque e atraia muito mais compradores para sua loja
        </Text>
      </View>

      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Benefícios exclusivos</Text>
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
            <Text style={[styles.benefitText, { color: theme.textSecondary }]}>{item.text}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <View style={styles.priceRow}>
          <View>
            <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>Por apenas</Text>
            <Text style={[styles.price, { color: theme.text }]}>R$ 29,90<Text style={[styles.pricePer, { color: theme.textSecondary }]}>/mês</Text></Text>
          </View>
          <TouchableOpacity style={[styles.ctaButton, activating && { opacity: 0.6 }]} onPress={handleActivate} disabled={activating}>
            <Text style={styles.ctaText}>{activating ? 'Ativando...' : 'Ativar destaque'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.cancelNote, { color: theme.textTertiary }]}>Cancele a qualquer momento</Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { alignItems: 'center', padding: 32 },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.warning[50], justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 26, fontWeight: '700' },
  subtitle: { fontSize: 15, textAlign: 'center', marginTop: 12, lineHeight: 22 },
  section: { marginTop: 12, padding: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 16 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  benefitIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.warning[50], justifyContent: 'center', alignItems: 'center',
  },
  benefitText: { flex: 1, fontSize: 14, lineHeight: 20 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceLabel: { fontSize: 13 },
  price: { fontSize: 28, fontWeight: '800', marginTop: 2 },
  pricePer: { fontSize: 15, fontWeight: '400' },
  ctaButton: {
    backgroundColor: colors.warning[500], paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelNote: { fontSize: 12, marginTop: 12, textAlign: 'center' },
});
