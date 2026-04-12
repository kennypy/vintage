import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, FlatList, ActivityIndicator, Modal } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { createBump } from '../../src/services/promotions';
import { getUserListings } from '../../src/services/users';
import { useAuth } from '../../src/contexts/AuthContext';

const PLANS = [
  { name: '1 dia', price: 'R$ 4,90', highlight: false },
  { name: '3 dias', price: 'R$ 9,90', highlight: true, tag: 'Mais popular' },
  { name: '7 dias', price: 'R$ 19,90', highlight: false },
];

interface ListingItem {
  id: string;
  title: string;
  priceBrl: number;
  images?: { url: string }[];
}

export default function BoostScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [showPicker, setShowPicker] = useState(false);
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [boosting, setBoosting] = useState(false);

  const openPicker = async () => {
    setShowPicker(true);
    setLoadingListings(true);
    try {
      if (!user?.id) return;
      const data = await getUserListings(user.id);
      const active = (data.data ?? data).filter((l: ListingItem & { status?: string }) => l.status === 'ACTIVE');
      setListings(active);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar seus anúncios.');
    } finally {
      setLoadingListings(false);
    }
  };

  const handleBoost = async (listingId: string) => {
    setBoosting(true);
    try {
      await createBump(listingId);
      setShowPicker(false);
      Alert.alert('Impulsionado!', 'Seu anúncio agora aparece no topo das buscas.', [
        { text: 'Ver meus anúncios', onPress: () => router.push('/my-listings') },
      ]);
    } catch {
      Alert.alert('Erro', 'Não foi possível impulsionar o anúncio. Tente novamente.');
    } finally {
      setBoosting(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
      <View style={[styles.hero, { backgroundColor: theme.card }]}>
        <View style={styles.iconCircle}>
          <Ionicons name="rocket" size={48} color={colors.primary[600]} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Impulsionar anúncio</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Apareça no topo das buscas e receba muito mais visitas
        </Text>
      </View>

      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Escolha o plano</Text>
        {PLANS.map((plan) => (
          <TouchableOpacity
            key={plan.name}
            style={[
              styles.planCard,
              { borderColor: theme.border, backgroundColor: theme.card },
              plan.highlight && styles.planCardHighlight,
            ]}
          >
            <View style={styles.planLeft}>
              <Text style={[styles.planName, { color: theme.text }, plan.highlight && styles.planNameHighlight]}>
                {plan.name}
              </Text>
              {plan.tag && (
                <View style={styles.planTag}>
                  <Text style={styles.planTagText}>{plan.tag}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.planPrice, { color: theme.text }, plan.highlight && styles.planPriceHighlight]}>
              {plan.price}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.section, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>O que você ganha</Text>
        {[
          'Posição de destaque nas buscas',
          'Selo "Impulsionado" no anúncio',
          'Relatório de desempenho',
          'Mais visualizações garantidas',
        ].map((benefit) => (
          <View key={benefit} style={styles.benefit}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success[500]} />
            <Text style={[styles.benefitText, { color: theme.textSecondary }]}>{benefit}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.ctaButton} onPress={openPicker}>
        <Text style={styles.ctaText}>Escolher anúncio para impulsionar</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />

      {/* Listing picker modal */}
      <Modal visible={showPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Escolha o anúncio</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>
            {loadingListings ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary[500]} />
            ) : listings.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                Você não tem anúncios ativos para impulsionar.
              </Text>
            ) : (
              <FlatList
                data={listings}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.listingItem, { borderColor: theme.border }]}
                    onPress={() => handleBoost(item.id)}
                    disabled={boosting}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.listingTitle, { color: theme.text }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={[styles.listingPrice, { color: colors.primary[600] }]}>
                        R$ {Number(item.priceBrl).toFixed(2).replace('.', ',')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
                  </TouchableOpacity>
                )}
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
  subtitle: { fontSize: 15, textAlign: 'center', marginTop: 12, lineHeight: 22 },
  section: { marginTop: 12, padding: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 16 },
  planCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderRadius: 12,
    padding: 16, marginBottom: 10,
  },
  planCardHighlight: { borderColor: colors.primary[500], backgroundColor: colors.primary[50] },
  planLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planName: { fontSize: 16, fontWeight: '600' },
  planNameHighlight: { color: colors.primary[700] },
  planTag: {
    backgroundColor: colors.primary[500], paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
  },
  planTagText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  planPrice: { fontSize: 16, fontWeight: '700' },
  planPriceHighlight: { color: colors.primary[600] },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  benefitText: { fontSize: 14 },
  ctaButton: {
    margin: 20, backgroundColor: colors.primary[600],
    paddingVertical: 16, borderRadius: 12, alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 14 },
  listingItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: 1, gap: 12,
  },
  listingTitle: { fontSize: 14, fontWeight: '500' },
  listingPrice: { fontSize: 13, fontWeight: '600', marginTop: 2 },
});
