import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { EmptyState } from '../../src/components/EmptyState';
import { useAuth } from '../../src/contexts/AuthContext';
import { getUserListings } from '../../src/services/users';
import { deleteListing } from '../../src/services/listings';
import { getUserDemoListings } from '../../src/services/demoStore';

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
  const { theme } = useTheme();
  const [listings, setListings] = useState<MyListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');
  // Rendered inline when the fetch fails so a real API error can't hide
  // behind a silent fallback to the in-memory demo store. That fallback
  // was directly responsible for "created a listing and nothing showed" —
  // the create POST failed, the user saw a fake success, and my-listings
  // then quietly served stale demo items instead of flagging the load
  // failure so they could retry.
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    if (!user?.id) return;
    setFetchError(null);
    try {
      const data = await getUserListings(user.id);
      setListings(data.items as unknown as MyListing[]);
    } catch (error) {
      // Keep the in-memory demo store usable for local dev (we add to it
      // explicitly from e.g. seed scripts) but only surface those items
      // when they actually exist; otherwise flag the failure.
      const demoItems = getUserDemoListings(user.id).map((l) => ({
        id: l.id,
        title: l.title,
        priceBrl: l.priceBrl,
        status: 'ACTIVE',
        images: l.images.map((img) => ({ url: img.url, position: img.order })),
        condition: l.condition,
        size: l.size,
        createdAt: l.createdAt,
        favoriteCount: 0,
        viewCount: l.viewCount,
      }));
      if (demoItems.length > 0) {
        setListings(demoItems);
      } else {
        setListings([]);
        setFetchError(
          error instanceof Error && error.message
            ? error.message
            : 'Não foi possível carregar seus anúncios.',
        );
      }
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

  const renderListing = useCallback(({ item }: { item: MyListing }) => {
    const statusInfo = STATUS_LABELS[item.status] ?? STATUS_LABELS.ACTIVE;
    const imageUrl = item.images?.sort((a, b) => a.position - b.position)[0]?.url;

    return (
      <View style={[styles.listingCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.listingRow}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.thumbnail} transition={200} cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder, { backgroundColor: theme.inputBg }]}>
              <Ionicons name="image-outline" size={24} color={theme.textTertiary} />
            </View>
          )}
          <View style={styles.listingInfo}>
            <Text style={[styles.listingTitle, { color: theme.text }]} numberOfLines={2}>{item.title}</Text>
            <Text style={[styles.listingPrice, { color: theme.text }]}>{formatPrice(item.priceBrl)}</Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Ionicons name="eye-outline" size={14} color={theme.textSecondary} />
                <Text style={[styles.statText, { color: theme.textSecondary }]}>{item.viewCount}</Text>
              </View>
              <View style={styles.stat}>
                <Ionicons name="heart-outline" size={14} color={theme.textSecondary} />
                <Text style={[styles.statText, { color: theme.textSecondary }]}>{item.favoriteCount}</Text>
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
                accessibilityLabel="Ver anúncio"
                accessibilityRole="button"
              >
                <Ionicons name="eye-outline" size={18} color={colors.primary[500]} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push(`/listing/edit/${item.id}`)}
                accessibilityLabel="Editar anúncio"
                accessibilityRole="button"
              >
                <Ionicons name="create-outline" size={18} color={colors.primary[500]} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleDelete(item)}
                accessibilityLabel="Excluir anúncio"
                accessibilityRole="button"
              >
                <Ionicons name="trash-outline" size={18} color={colors.error[500]} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }, [theme, router, handleDelete]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.filterBar, { borderBottomColor: theme.border }]}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.filterTab, { backgroundColor: theme.inputBg }, filter === tab.key && styles.filterTabActive]}
            onPress={() => setFilter(tab.key)}
          >
            <Text style={[styles.filterTabText, { color: theme.textSecondary }, filter === tab.key && styles.filterTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {fetchError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Erro ao carregar anúncios"
          subtitle={fetchError}
          actionLabel="Tentar novamente"
          onAction={fetchListings}
        />
      ) : filteredListings.length === 0 ? (
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
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={11}
          initialNumToRender={8}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16, paddingVertical: 12, gap: 8,
    borderBottomWidth: 1,
  },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  filterTabActive: { backgroundColor: colors.primary[500] },
  filterTabText: { fontSize: 13, fontWeight: '500' },
  filterTabTextActive: { color: '#ffffff' },
  list: { padding: 16 },
  listingCard: {
    borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1,
  },
  listingRow: { flexDirection: 'row' },
  thumbnail: {
    width: 72, height: 90, borderRadius: 8,
  },
  thumbnailPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  listingInfo: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  listingTitle: { fontSize: 14, fontWeight: '500', lineHeight: 18 },
  listingPrice: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 6 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { fontSize: 12 },
  rightColumn: { alignItems: 'flex-end', justifyContent: 'space-between', marginLeft: 8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8 },
  actionButton: { padding: 6 },
});
