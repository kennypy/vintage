import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { createSpotlight, getActivePromotions } from '../../src/services/promotions';
import { showThemedAlert } from '../../src/components/ThemedAlert';
import { SPOTLIGHT_PRICE_BRL, SPOTLIGHT_DURATION_DAYS } from '@vintage/shared';

export default function HighlightScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [activating, setActivating] = useState(false);
  const [activeUntil, setActiveUntil] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // A spotlight promotes the whole shop (not a single listing), so the
  // "already active" gate is per-user, not per-listing. Without this
  // check the user could tap the CTA twice and hit an API 400.
  useEffect(() => {
    let cancelled = false;
    getActivePromotions()
      .then((promos) => {
        if (cancelled) return;
        const spotlight = promos.find((p) => p.type === 'SPOTLIGHT');
        setActiveUntil(spotlight ? spotlight.endsAt : null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingStatus(false);
      });
    return () => { cancelled = true; };
  }, []);

  const formatUntil = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleActivate = () => {
    if (activeUntil) return;
    const priceFormatted = SPOTLIGHT_PRICE_BRL.toFixed(2).replace('.', ',');
    showThemedAlert(
      'Confirmar pagamento',
      `Confirmar pagamento de R$ ${priceFormatted}?\n\nSeu perfil será destaque por ${SPOTLIGHT_DURATION_DAYS} dias.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setActivating(true);
            try {
              const promo = await createSpotlight();
              setActiveUntil(promo.endsAt);
              showThemedAlert(
                'Destaque ativado!',
                `Seu perfil agora tem o selo de loja em destaque por ${SPOTLIGHT_DURATION_DAYS} dias. O valor de R$ ${priceFormatted} foi debitado da sua carteira.`,
                [{ text: 'Ver meu perfil', onPress: () => router.push('/(tabs)/profile') }, { text: 'OK', style: 'cancel' }],
              );
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Não foi possível ativar o destaque. Tente novamente.';
              showThemedAlert('Erro', message);
            } finally {
              setActivating(false);
            }
          },
        },
      ],
    );
  };

  const ctaDisabled = activating || !!activeUntil || loadingStatus;
  const ctaLabel = activating
    ? 'Ativando...'
    : activeUntil
      ? 'Destaque ativo'
      : 'Ativar destaque';

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
        {activeUntil ? (
          <View style={[styles.activeBanner, { backgroundColor: colors.success[50], borderColor: colors.success[500] }]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success[600]} />
            <Text style={[styles.activeBannerText, { color: colors.success[700] }]}>
              Destaque ativo até {formatUntil(activeUntil)}
            </Text>
          </View>
        ) : null}
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
          <TouchableOpacity
            style={[styles.ctaButton, ctaDisabled && { opacity: 0.6 }]}
            onPress={handleActivate}
            disabled={ctaDisabled}
          >
            <Text style={styles.ctaText}>{ctaLabel}</Text>
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
  activeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1, marginTop: 16,
  },
  activeBannerText: { fontSize: 13, fontWeight: '600' },
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
