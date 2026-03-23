import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { getPublicProfile, followUser, unfollowUser } from '../../src/services/users';
import { getListings } from '../../src/services/listings';
import { ListingCard } from '../../src/components/ListingCard';
import type { PublicProfile } from '../../src/services/users';
import type { Listing } from '../../src/services/listings';

function mapListingToCard(listing: Listing) {
  return {
    id: listing.id,
    title: listing.title,
    priceBrl: listing.priceBrl,
    imageUrl: listing.images[0]?.url,
    sellerName: listing.seller.name,
    condition: listing.condition,
    size: listing.size,
  };
}

export default function SellerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [profileData, listingsData] = await Promise.all([
        getPublicProfile(id ?? ''),
        getListings({ search: undefined, category: undefined }),
      ]);
      setProfile(profileData);
      setListings(listingsData.items.map(mapListingToCard));
    } catch (_error) {
      // Keep defaults
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleFollowToggle = async () => {
    if (!profile) return;
    setFollowLoading(true);
    try {
      if (profile.isFollowing) {
        await unfollowUser(profile.id);
        setProfile({ ...profile, isFollowing: false, followerCount: profile.followerCount - 1 });
      } else {
        await followUser(profile.id);
        setProfile({ ...profile, isFollowing: true, followerCount: profile.followerCount + 1 });
      }
    } catch (_error) {
      // Silently fail
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading || !profile) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  const headerComponent = (
    <View>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarPlaceholder}>
          <Ionicons name="person" size={36} color={colors.neutral[400]} />
        </View>
        <View style={styles.profileInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{profile.name}</Text>
            {profile.verified && (
              <Ionicons name="checkmark-circle" size={18} color={colors.primary[500]} />
            )}
          </View>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color={colors.warning[500]} />
            <Text style={styles.ratingText}>
              {profile.ratingAvg} ({profile.ratingCount} avaliações)
            </Text>
          </View>
          <Text style={styles.memberSince}>
            Membro desde {new Date(profile.createdAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{profile.listingCount}</Text>
          <Text style={styles.statLabel}>Anúncios</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{profile.followerCount}</Text>
          <Text style={styles.statLabel}>Seguidores</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{profile.followingCount}</Text>
          <Text style={styles.statLabel}>Seguindo</Text>
        </View>
      </View>

      {/* Follow Button */}
      <View style={styles.followContainer}>
        <TouchableOpacity
          style={[
            styles.followButton,
            profile.isFollowing && styles.followingButton,
            followLoading && styles.followDisabled,
          ]}
          onPress={handleFollowToggle}
          disabled={followLoading}
        >
          <Ionicons
            name={profile.isFollowing ? 'checkmark' : 'add'}
            size={18}
            color={profile.isFollowing ? colors.primary[600] : colors.neutral[0]}
          />
          <Text style={[
            styles.followText,
            profile.isFollowing && styles.followingText,
          ]}>
            {followLoading
              ? 'Carregando...'
              : profile.isFollowing
                ? 'Seguindo'
                : 'Seguir'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Listings Header */}
      <View style={styles.listingsHeader}>
        <Text style={styles.listingsTitle}>Anúncios ({profile.listingCount})</Text>
      </View>
    </View>
  );

  return (
    <FlatList
      style={styles.container}
      data={listings}
      numColumns={2}
      keyExtractor={(item) => item.id}
      columnWrapperStyle={styles.row}
      renderItem={({ item }) => <ListingCard {...item} />}
      ListHeaderComponent={headerComponent}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="pricetags-outline" size={48} color={colors.neutral[300]} />
          <Text style={styles.emptyText}>Nenhum anúncio publicado</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  centered: { justifyContent: 'center', alignItems: 'center' },
  profileHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    backgroundColor: colors.neutral[0],
  },
  avatarPlaceholder: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.neutral[100],
    justifyContent: 'center', alignItems: 'center',
  },
  profileInfo: { flex: 1, marginLeft: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 20, fontWeight: '700', color: colors.neutral[900] },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ratingText: { fontSize: 13, color: colors.neutral[500] },
  memberSince: { fontSize: 12, color: colors.neutral[400], marginTop: 4 },
  statsRow: {
    flexDirection: 'row', backgroundColor: colors.neutral[0], paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: colors.neutral[200],
  },
  stat: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 18, fontWeight: '700', color: colors.neutral[900] },
  statLabel: { fontSize: 12, color: colors.neutral[500], marginTop: 2 },
  statDivider: { width: 1, backgroundColor: colors.neutral[200] },
  followContainer: { padding: 16, backgroundColor: colors.neutral[0] },
  followButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 10,
    backgroundColor: colors.primary[600],
  },
  followingButton: {
    backgroundColor: colors.neutral[0],
    borderWidth: 1, borderColor: colors.primary[600],
  },
  followDisabled: { opacity: 0.6 },
  followText: { fontSize: 15, fontWeight: '600', color: colors.neutral[0] },
  followingText: { color: colors.primary[600] },
  listingsHeader: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 8, borderTopColor: colors.neutral[100],
  },
  listingsTitle: { fontSize: 16, fontWeight: '600', color: colors.neutral[900] },
  listContent: { paddingBottom: 16 },
  row: { justifyContent: 'space-between', paddingHorizontal: 12 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 14, color: colors.neutral[400], marginTop: 12 },
});
