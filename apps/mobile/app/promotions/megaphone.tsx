import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, FlatList, Image } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { getUserListings } from '../../src/services/users';
import { getUserDemoListings } from '../../src/services/demoStore';

interface ActiveListing {
  id: string;
  title: string;
  priceBrl: number;
  imageUrl?: string;
}

export default function MegaphoneScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [showListings, setShowListings] = useState(false);
  const [activeListings, setActiveListings] = useState<ActiveListing[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [boostedId, setBoostedId] = useState<string | null>(null);

  const fetchActiveListings = useCallback(async () => {
    if (!user?.id) return;
    setLoadingListings(true);
    try {
      const data = await getUserListings(user.id);
      const active = (data.items as any[])
        .filter((l: any) => l.status === 'ACTIVE')
        .map((l: any) => ({
          id: l.id,
          title: l.title,
          priceBrl: l.priceBrl,
          imageUrl: l.images?.sort((a: any, b: any) => a.position - b.position)[0]?.url,
        }));
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
    setBoostedId(listing.id);
    setShowListings(false);
    Alert.alert(
      'Megafone ativado!',
      `"${listing.title}" será destacado para mais compradores por 24h.`,
    );
  };

  const formatBrl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

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
            <View style={styles.modalHeader}>
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
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.listingRow, { borderBottomColor: theme.border }, boostedId === item.id && styles.listingRowBoosted]}
                    onPress={() => handleBoost(item)}
                  >
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.listingThumb} />
                    ) : (
                      <View style={[styles.listingThumb, styles.listingThumbPlaceholder, { backgroundColor: theme.inputBg }]}>
                        <Ionicons name="image-outline" size={20} color={theme.textTertiary} />
                      </View>
                    )}
                    <View style={styles.listingInfo}>
                      <Text style={[styles.listingTitle, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
                      <Text style={[styles.listingPrice, { color: theme.textSecondary }]}>R$ {formatBrl(item.priceBrl)}</Text>
                    </View>
                    {boostedId === item.id ? (
                      <Ionicons name="checkmark-circle" size={22} color={colors.success[500]} />
                    ) : (
                      <Ionicons name="megaphone-outline" size={22} color={colors.primary[500]} />
                    )}
                  </TouchableOpacity>
                )}
                style={styles.listingList}
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
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  emptyState: { alignItems: 'center', padding: 32, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  listingList: { paddingHorizontal: 16 },
  listingRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  listingRowBoosted: { opacity: 0.7 },
  listingThumb: { width: 56, height: 56, borderRadius: 8 },
  listingThumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  listingInfo: { flex: 1 },
  listingTitle: { fontSize: 14, fontWeight: '500' },
  listingPrice: { fontSize: 13, marginTop: 2 },
});
