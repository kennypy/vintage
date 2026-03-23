import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { EmptyState } from '../../src/components/EmptyState';
import { useAuth } from '../../src/contexts/AuthContext';
import { getUserListings } from '../../src/services/users';
import { deleteListing } from '../../src/services/listings';

type StatusFilter = 'all' | 'ACTIVE' | 'PAUSED' | 'SOLD';

interface MyListing {
  id: string;
  title: string;
  priceBrl: number;
  status: string;
  images: Array<{ url: string; position: number }>;
  condition: string;
  size: string;
  createdAt: string;
  favoriteCount: number;
  viewCount: number;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE: { label: 'Ativo', color: colors.success[700], bg: colors.success[50] },
  PAUSED: { label: 'Pausado', color: colors.warning[700], bg: colors.warning[50] },
  SOLD: { label: 'Vendido', color: colors.neutral[600], bg: colors.neutral[100] },
  DELETED: { label: 'Excluído', color: colors.error[600], bg: colors.error[50] },
};

const FILTER_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'ACTIVE', label: 'Ativos' },
  { key: 'PAUSED', label: 'Pausados' },
  { key: 'SOLD', label: 'Vendidos' },
];

export default function MyListingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [listings, setListings] = useState<MyListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');

  const fetchListings = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await getUserListings(user.id);
      setListings(data.items as unknown as MyListing[]);
    } catch (_error) {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchListings();
  }, [fetchListings]);

  const handleDelete = useCallback((listing: MyListing) => {
    Alert.alert(
      'Excluir anúncio',
      `Tem certeza que deseja excluir "${listing.title}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteListing(listing.id);
              setListings((prev) => prev.filter((l) => l.id !== listing.id));
            } catch (_error) {
              Alert.alert('Erro', 'Não foi possível excluir o anúncio.');
            }
          },
        },
      ],
    );
  }, []);

  const filteredListings = filter === 'all'
    ? listings
    : listings.filter((l) => l.status === filter);

  const formatPrice = (price: number) =>
    price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const renderListing = ({ item }: { item: MyListing }) => {
    const statusInfo = STATUS_LABELS[item.status] ?? STATUS_LABELS.ACTIVE;
    const imageUrl = item.images?.sort((a, b) => a.position - b.position)[0]?.url;

    return (
      <View style={styles.listingCard}>
        <View style={styles.listingRow}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.thumbnail} />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <Ionicons name="image-outline" size={24} color={colors.neutral[400]} />
            </View>
          )}
          <View style={styles.listingInfo}>
            <Text style={styles.listingTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.listingPrice}>{formatPrice(item.priceBrl)}</Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Ionicons name="eye-outline" size={14} color={colors.neutral[500]} />
                <Text style={styles.statText}>{item.viewCount}</Text>
              </View>
              <View style={styles.stat}>
                <Ionicons name="heart-outline" size={14} color={colors.neutral[500]} />
                <Text style={styles.statText}>{item.favoriteCount}</Text>
              </View>
            </View>
          </View>
          <View style={styles.rightColumn}>
            <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
              <Text style={[styles.statusText, { color: statusInfo.color }]}>
                {statusInfo.label}
              </Text>
            </View>
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push(`/listing/${item.id}`)}
              >
                <Ionicons name="eye-outline" size={18} color={colors.primary[500]} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleDelete(item)}
              >
                <Ionicons name="trash-outline" size={18} color={colors.error[500]} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterBar}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.filterTab, filter === tab.key && styles.filterTabActive]}
            onPress={() => setFilter(tab.key)}
          >
            <Text style={[styles.filterTabText, filter === tab.key && styles.filterTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filteredListings.length === 0 ? (
        <EmptyState
          icon="pricetag-outline"
          title="Nenhum anúncio encontrado"
          subtitle={filter === 'all' ? 'Comece a vender seus itens' : 'Nenhum anúncio com esse status'}
          actionLabel={filter === 'all' ? 'Criar anúncio' : undefined}
          onAction={filter === 'all' ? () => router.push('/(tabs)/sell') : undefined}
        />
      ) : (
        <FlatList
          data={filteredListings}
          renderItem={renderListing}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary[500]} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.neutral[100],
  },
  filterTabActive: {
    backgroundColor: colors.primary[500],
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.neutral[600],
  },
  filterTabTextActive: {
    color: '#ffffff',
  },
  list: {
    padding: 16,
  },
  listingCard: {
    backgroundColor: colors.neutral[50],
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  listingRow: {
    flexDirection: 'row',
  },
  thumbnail: {
    width: 72,
    height: 90,
    borderRadius: 8,
    backgroundColor: colors.neutral[200],
  },
  thumbnailPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  listingTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.neutral[800],
    lineHeight: 18,
  },
  listingPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.neutral[900],
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statText: {
    fontSize: 12,
    color: colors.neutral[500],
  },
  rightColumn: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginLeft: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 6,
  },
});
