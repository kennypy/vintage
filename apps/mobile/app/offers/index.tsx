import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { getOffers, acceptOffer, rejectOffer } from '../../src/services/offers';
import type { Offer } from '../../src/services/offers';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  accepted: 'Aceita',
  rejected: 'Recusada',
  expired: 'Expirada',
};

const STATUS_COLORS: Record<string, string> = {
  pending: colors.warning[500],
  accepted: colors.success[500],
  rejected: colors.error[500],
  expired: colors.neutral[400],
};

const formatBrl = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function OffersScreen() {
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOffers = useCallback(async () => {
    try {
      const response = await getOffers(activeTab);
      setOffers(response.items);
    } catch (_error) {
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setLoading(true);
    fetchOffers();
  }, [fetchOffers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOffers();
    setRefreshing(false);
  }, [fetchOffers]);

  const handleAccept = async (offer: Offer) => {
    Alert.alert(
      'Aceitar oferta',
      `Aceitar oferta de R$ ${formatBrl(offer.amountBrl)} de ${offer.buyer.name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aceitar',
          onPress: async () => {
            try {
              const updated = await acceptOffer(offer.id);
              setOffers((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
              Alert.alert('Oferta aceita!', 'O comprador será notificado.');
            } catch (_error) {
              Alert.alert('Erro', 'Não foi possível aceitar a oferta.');
            }
          },
        },
      ],
    );
  };

  const handleReject = async (offer: Offer) => {
    Alert.alert(
      'Recusar oferta',
      `Recusar oferta de R$ ${formatBrl(offer.amountBrl)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Recusar',
          style: 'destructive',
          onPress: async () => {
            try {
              const updated = await rejectOffer(offer.id);
              setOffers((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            } catch (_error) {
              Alert.alert('Erro', 'Não foi possível recusar a oferta.');
            }
          },
        },
      ],
    );
  };

  const renderOffer = ({ item }: { item: Offer }) => (
    <View style={styles.offerCard}>
      <View style={styles.offerHeader}>
        <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[item.status] ?? colors.neutral[400]) + '20' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] ?? colors.neutral[400] }]}>
            {STATUS_LABELS[item.status] ?? item.status}
          </Text>
        </View>
        <Text style={styles.offerDate}>
          {new Date(item.createdAt).toLocaleDateString('pt-BR')}
        </Text>
      </View>
      <Text style={styles.offerListing} numberOfLines={1}>{item.listingTitle}</Text>
      <Text style={styles.offerAmount}>R$ {formatBrl(item.amountBrl)}</Text>
      <Text style={styles.offerFrom}>
        {activeTab === 'received'
          ? `De: ${item.buyer.name}`
          : `Para: ${item.seller.name}`}
      </Text>

      {activeTab === 'received' && item.status === 'pending' && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.rejectButton}
            onPress={() => handleReject(item)}
          >
            <Text style={styles.rejectText}>Recusar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => handleAccept(item)}
          >
            <Text style={styles.acceptText}>Aceitar</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'received' && styles.tabActive]}
          onPress={() => setActiveTab('received')}
        >
          <Text style={[styles.tabText, activeTab === 'received' && styles.tabTextActive]}>
            Recebidas
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'sent' && styles.tabActive]}
          onPress={() => setActiveTab('sent')}
        >
          <Text style={[styles.tabText, activeTab === 'sent' && styles.tabTextActive]}>
            Enviadas
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(item) => item.id}
          renderItem={renderOffer}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="pricetags-outline" size={64} color={colors.neutral[300]} />
              <Text style={styles.emptyTitle}>Nenhuma oferta</Text>
              <Text style={styles.emptyText}>
                {activeTab === 'received'
                  ? 'Ofertas recebidas aparecerão aqui.'
                  : 'Ofertas enviadas aparecerão aqui.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabs: {
    flexDirection: 'row', backgroundColor: colors.neutral[0],
    borderBottomWidth: 1, borderBottomColor: colors.neutral[200],
  },
  tab: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary[600] },
  tabText: { fontSize: 15, fontWeight: '500', color: colors.neutral[500] },
  tabTextActive: { color: colors.primary[600], fontWeight: '600' },
  list: { padding: 12 },
  offerCard: {
    backgroundColor: colors.neutral[0], borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: colors.neutral[200],
  },
  offerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '600' },
  offerDate: { fontSize: 12, color: colors.neutral[400] },
  offerListing: { fontSize: 14, fontWeight: '500', color: colors.neutral[800] },
  offerAmount: { fontSize: 18, fontWeight: '700', color: colors.primary[600], marginTop: 4 },
  offerFrom: { fontSize: 13, color: colors.neutral[500], marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  rejectButton: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: colors.error[500], alignItems: 'center',
  },
  rejectText: { fontSize: 14, fontWeight: '600', color: colors.error[500] },
  acceptButton: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: colors.success[500], alignItems: 'center',
  },
  acceptText: { fontSize: 14, fontWeight: '600', color: colors.neutral[0] },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.neutral[900], marginTop: 16 },
  emptyText: { fontSize: 14, color: colors.neutral[400], marginTop: 4 },
});
