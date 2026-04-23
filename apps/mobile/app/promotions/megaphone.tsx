import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { getUserListings } from '../../src/services/users';
import { getUserDemoListings } from '../../src/services/demoStore';
import { createMegafone, getActivePromotions } from '../../src/services/promotions';
import { showThemedAlert } from '../../src/components/ThemedAlert';
import { MEGAFONE_FREE_DAYS } from '@vintage/shared';

interface ActiveListing {
  id: string;
  title: string;
  priceBrl: number;
  imageUrl?: string;
  activeUntil?: string; // set when this listing already has an active megafone
}

export default function MegaphoneScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [showListings, setShowListings] = useState(false);
  const [activeListings, setActiveListings] = useState<ActiveListing[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [boosting, setBoosting] = useState(false);

  const fetchActiveListings = useCallback(async () => {
    if (!user?.id) return;
    setLoadingListings(true);
    try {
      // Pull active promotions in parallel so we can mark each listing's
      // current state instead of pretending they're all re-activatable —
      // the API rejects a second megafone with a 400, so tapping again
      // was just producing an error popup.
      const [listingsRes, promotions] = await Promise.all([
        getUserListings(user.id),
        getActivePromotions().catch(() => [] as { listingId?: string; type: string; endsAt: string }[]),
      ]);
      const megafoneByListing = new Map<string, string>();
      for (const promo of promotions) {
        if (promo.type === 'MEGAFONE' && promo.listingId) {
          megafoneByListing.set(promo.listingId, promo.endsAt);
        }
      }
      const active = (listingsRes.items as any[])
        .filter((l: any) => l.status === 'ACTIVE')
        .map((l: any) => ({
          id: l.id,
          title: l.title,
          priceBrl: l.priceBrl,
          imageUrl: l.images?.sort((a: any, b: any) => a.position - b.position)[0]?.url,
          activeUntil: megafoneByListing.get(l.id),
        }));
      // Boosted listings float to the top so users see their active
      // megafones first — "it should show as activated with the listing
      // underneath" per product feedback.
      active.sort((a: ActiveListing, b: ActiveListing) => {
        if (!!a.activeUntil === !!b.activeUntil) return 0;
        return a.activeUntil ? -1 : 1;
      });
      setActiveListings(active);
    } catch {
      const demoItems = getUserDemoListings(user.id).map((l) => ({
        id: l.id,
        title: l.title,
        priceBrl: l.priceBrl,
        imageUrl: l.images[0]?.url,
      }));
      setActiveListings(demoItems);
    } finally {
      setLoadingListings(false);
    }
  }, [user?.id]);

  const handleCta = async () => {
    await fetchActiveListings();
    setShowListings(true);
  };

  const handleBoost = (listing: ActiveListing) => {
    if (listing.activeUntil) return; // already boosted — UI row is disabled
    showThemedAlert(
      'Confirmar Megafone',
      `Ativar megafone gratuito para "${listing.title}"?\n\nSeu anúncio será destacado por ${MEGAFONE_FREE_DAYS} dias.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setBoosting(true);
            try {
              const promo = await createMegafone(listing.id);
              setActiveListings((prev) => {
                const updated = prev.map((item) =>
                  item.id === listing.id ? { ...item, activeUntil: promo.endsAt } : item,
                );
                updated.sort((a, b) => {
                  if (!!a.activeUntil === !!b.activeUntil) return 0;
                  return a.activeUntil ? -1 : 1;
                });
                return updated;
              });
              showThemedAlert(
                'Megafone ativado!',
                `"${listing.title}" será destacado para mais compradores por ${MEGAFONE_FREE_DAYS} dias.`,
              );
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Não foi possível ativar o megafone. Tente novamente.';
              showThemedAlert('Erro', message);
            } finally {
              setBoosting(false);
            }
          },
        },
      ],
    );
  };

  const formatBrl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const formatUntil = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
      <View style={[styles.hero, { backgroundColor: theme.card }]}>
        <View style={styles.iconCircle}>
          <Ionicons name="megaphone" size={48} color={colors.primary[600]} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Megafone</Text>
        <View style={styles.freeBadge}>
          <Text style={styles.freeBadgeText}>Grátis</Text>
        </View>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Destaque seu anúncio para mais compradores e venda mais rápido!
        </Text>
      </View>

      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Como funciona</Text>
        {[
          'Escolha um anúncio para impulsionar',
          'Seu anúncio aparece no topo das buscas por 24h',
          'Receba mais visitas e venda mais rápido',
        ].map((text, i) => (
          <View key={i} style={styles.step}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
            <Text style={[styles.stepText, { color: theme.textSecondary }]}>{text}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Benefícios</Text>
        {[
          'Visibilidade 10x maior',
          'Aparece primeiro nas buscas',
          'Notificação para compradores interessados',
          '1 uso grátis por mês',
        ].map((benefit) => (
          <View key={benefit} style={styles.benefit}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success[500]} />
            <Text style={[styles.benefitText, { color: theme.textSecondary }]}>{benefit}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.ctaButton} onPress={handleCta}>
        <Text style={styles.ctaText}>Usar meu Megafone grátis</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />

      {/* Listing picker modal */}
      <Modal visible={showListings} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Escolha um anúncio</Text>
              <TouchableOpacity onPress={() => setShowListings(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {loadingListings ? (
              <ActivityIndicator size="large" color={colors.primary[500]} style={{ marginVertical: 32 }} />
            ) : activeListings.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="pricetag-outline" size={48} color={theme.textTertiary} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  Você não tem anúncios ativos. Publique um anúncio primeiro.
                </Text>
              </View>
            ) : (
              <FlatList
                data={activeListings}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const isActive = !!item.activeUntil;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.listingRow,
                        { borderBottomColor: theme.border },
                        isActive && { backgroundColor: theme.cardSecondary },
                      ]}
                      onPress={() => handleBoost(item)}
                      disabled={boosting || isActive}
                      activeOpacity={isActive ? 1 : 0.6}
                    >
                      {item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} style={styles.listingThumb} transition={200} cachePolicy="memory-disk" />
                      ) : (
                        <View style={[styles.listingThumb, styles.listingThumbPlaceholder, { backgroundColor: theme.inputBg }]}>
                          <Ionicons name="image-outline" size={20} color={theme.textTertiary} />
                        </View>
                      )}
                      <View style={styles.listingInfo}>
                        <Text style={[styles.listingTitle, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
                        <Text style={[styles.listingPrice, { color: theme.textSecondary }]}>R$ {formatBrl(item.priceBrl)}</Text>
                        {isActive && item.activeUntil ? (
                          <View style={styles.activeBadge}>
                            <Ionicons name="megaphone" size={12} color={colors.success[600]} />
                            <Text style={[styles.activeBadgeText, { color: colors.success[600] }]}>
                              Ativado até {formatUntil(item.activeUntil)}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      {isActive ? (
                        <Ionicons name="checkmark-circle" size={22} color={colors.success[500]} />
                      ) : (
                        <Ionicons name="megaphone-outline" size={22} color={colors.primary[500]} />
                      )}
                    </TouchableOpacity>
                  );
                }}
                style={styles.listingList}
                removeClippedSubviews={true}
                maxToRenderPerBatch={10}
                windowSize={11}
                initialNumToRender={8}
              />
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { alignItems: 'center', padding: 32 },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.primary[50], justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 26, fontWeight: '700' },
  freeBadge: {
    backgroundColor: colors.success[500], borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 4, marginTop: 8,
  },
  freeBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  subtitle: { fontSize: 15, textAlign: 'center', marginTop: 12, lineHeight: 22 },
  section: { marginTop: 12, padding: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 16 },
  step: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  stepNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primary[500], justifyContent: 'center', alignItems: 'center',
  },
  stepNumText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  benefitText: { fontSize: 14 },
  ctaButton: {
    margin: 20, backgroundColor: colors.primary[600],
    paddingVertical: 16, borderRadius: 12, alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '75%', paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  emptyState: { alignItems: 'center', padding: 32, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  listingList: { paddingHorizontal: 16 },
  listingRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 12, borderRadius: 8,
  },
  listingThumb: { width: 56, height: 56, borderRadius: 8 },
  listingThumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  listingInfo: { flex: 1 },
  listingTitle: { fontSize: 14, fontWeight: '500' },
  listingPrice: { fontSize: 13, marginTop: 2 },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4,
  },
  activeBadgeText: { fontSize: 12, fontWeight: '600' },
});
