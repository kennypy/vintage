import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import React, { useState, useEffect, useCallback } from 'react';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { getPublicProfile, followUser, unfollowUser } from '../../src/services/users';
import { blockUser, unblockUser, listBlockedUsers } from '../../src/services/moderation';
import { useAuth } from '../../src/contexts/AuthContext';
import { getListings } from '../../src/services/listings';
import { ListingCard } from '../../src/components/ListingCard';
import type { PublicProfile } from '../../src/services/users';
import type { Listing } from '../../src/services/listings';
import { getDemoListings } from '../../src/services/demoStore';

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
  const { theme } = useTheme();
  const router = useRouter();
  const { isDemoMode: demoMode, user: currentUser } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockActionLoading, setBlockActionLoading] = useState(false);

  // Viewing one's own profile should hide block/follow actions — the backend
  // rejects self-block with 400 anyway, but we don't want to show the option.
  const isSelf = !!currentUser && !!id && currentUser.id === id;

  const fetchData = useCallback(async () => {
    try {
      const [profileData, listingsData, blocksData] = await Promise.all([
        getPublicProfile(id ?? ''),
        getListings({ search: undefined, category: undefined }),
        // Unauthenticated / demo callers will 401 here — swallow so the
        // profile still renders (just without the blocked indicator).
        listBlockedUsers().catch(() => ({ blockedIds: [] as string[], items: [] })),
      ]);
      setProfile(profileData);
      setListings(listingsData.items.map(mapListingToCard));
      setIsBlocked(!!id && blocksData.blockedIds.includes(id));
    } catch (_error) {
      // API unavailable — build a demo profile from the seller in demo listings
      const demoListings = getDemoListings();
      const sellerListings = demoListings.filter((l) => l.seller.id === id);
      const seller = sellerListings[0]?.seller ?? { id: id ?? 'demo', name: 'Vendedor', rating: 5.0 };

      // Generate unique-ish counts per seller using id hash
      const idHash = (id ?? 'demo').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const demoProfile: PublicProfile = {
        id: seller.id,
        name: seller.name,
        verified: true,
        ratingAvg: seller.rating ?? 4.8,
        ratingCount: (idHash % 40) + 5,
        followerCount: (idHash % 80) + 10,
        followingCount: (idHash % 30) + 3,
        listingCount: sellerListings.length,
        isFollowing: false,
        createdAt: new Date(Date.now() - 86400000 * (90 + (idHash % 300))).toISOString(),
      };
      setProfile(demoProfile);
      setListings(sellerListings.map(mapListingToCard));
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
    // Optimistic update — flip state immediately so the button responds instantly
    const wasFollowing = profile.isFollowing;
    const optimisticProfile = {
      ...profile,
      isFollowing: !wasFollowing,
      followerCount: wasFollowing ? profile.followerCount - 1 : profile.followerCount + 1,
    };
    setProfile(optimisticProfile);

    // In demo mode there is no real API — keep the optimistic state as the final state.
    if (demoMode) return;

    setFollowLoading(true);
    try {
      if (wasFollowing) {
        await unfollowUser(profile.id);
      } else {
        await followUser(profile.id);
      }
    } catch (_error) {
      // API failed — revert to original state
      setProfile(profile);
    } finally {
      setFollowLoading(false);
    }
  };

  const renderItem = useCallback(({ item }: { item: any }) => (
    <ListingCard {...item} />
  ), []);

  const handleBlockAction = async () => {
    if (!profile || isSelf) return;
    if (demoMode) {
      // No real API in demo mode — just flip local state.
      setIsBlocked(!isBlocked);
      return;
    }
    setBlockActionLoading(true);
    try {
      if (isBlocked) {
        await unblockUser(profile.id);
        setIsBlocked(false);
      } else {
        await blockUser(profile.id);
        setIsBlocked(true);
        // When the user blocks someone they were following, the follow
        // relationship stays intact server-side but should read as "not
        // following" locally — the backend prevents interactions anyway.
        if (profile.isFollowing) {
          setProfile({ ...profile, isFollowing: false, followerCount: Math.max(0, profile.followerCount - 1) });
        }
      }
    } catch (_err) {
      Alert.alert('Erro', 'Não foi possível atualizar o bloqueio. Tente novamente.');
    } finally {
      setBlockActionLoading(false);
    }
  };

  const openActionSheet = () => {
    if (!profile || isSelf) return;
    const blockLabel = isBlocked ? 'Desbloquear usuário' : 'Bloquear usuário';
    Alert.alert(profile.name, undefined, [
      {
        text: blockLabel,
        style: isBlocked ? 'default' : 'destructive',
        onPress: handleBlockAction,
      },
      {
        text: 'Denunciar usuário',
        style: 'destructive',
        onPress: () => router.push(`/report/user/${encodeURIComponent(profile.id)}`),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  if (loading || !profile) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  const headerComponent = (
    <View>
      {/* Stack header overflow-menu button (only when viewing someone else) */}
      <Stack.Screen
        options={{
          headerRight: () =>
            !isSelf ? (
              <TouchableOpacity
                onPress={openActionSheet}
                disabled={blockActionLoading}
                accessibilityRole="button"
                accessibilityLabel="Mais opções"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ paddingHorizontal: 8 }}
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={theme.text} />
              </TouchableOpacity>
            ) : null,
        }}
      />

      {/* Blocked banner — tells the user why interactions are unavailable */}
      {isBlocked && (
        <View style={[styles.blockedBanner, { backgroundColor: colors.error[50], borderColor: colors.error[200] }]}>
          <Ionicons name="ban-outline" size={18} color={colors.error[600]} />
          <Text style={[styles.blockedBannerText, { color: colors.error[700] }]}>
            Você bloqueou este usuário. Mensagens e ofertas estão desativadas.
          </Text>
        </View>
      )}

      {/* Profile Header */}
      <View style={[styles.profileHeader, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={[styles.avatarPlaceholder, { backgroundColor: theme.cardSecondary }]}>
          <Ionicons name="person" size={36} color={theme.textTertiary} />
        </View>
        <View style={styles.profileInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: theme.text }]}>{profile.name}</Text>
            {profile.verified && (
              <Ionicons name="checkmark-circle" size={18} color={colors.primary[500]} />
            )}
          </View>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color={colors.warning[500]} />
            <Text style={[styles.ratingText, { color: theme.textSecondary }]}>
              {profile.ratingAvg} ({profile.ratingCount} avaliações)
            </Text>
          </View>
          <Text style={[styles.memberSince, { color: theme.textTertiary }]}>
            Membro desde {new Date(profile.createdAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={[styles.statsRow, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        <View style={styles.stat}>
          <Text style={[styles.statNumber, { color: theme.text }]}>{profile.listingCount}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Anúncios</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
        <TouchableOpacity
          style={styles.stat}
          onPress={() => Alert.alert('Seguidores', `${profile.name} tem ${profile.followerCount} seguidores.`)}
        >
          <Text style={[styles.statNumber, { color: theme.text }]}>{profile.followerCount}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Seguidores</Text>
        </TouchableOpacity>
        <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
        <TouchableOpacity
          style={styles.stat}
          onPress={() => Alert.alert('Seguindo', `${profile.name} segue ${profile.followingCount} pessoas.`)}
        >
          <Text style={[styles.statNumber, { color: theme.text }]}>{profile.followingCount}</Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Seguindo</Text>
        </TouchableOpacity>
      </View>

      {/* Follow Button — disabled while blocked so the UI matches the
          backend's interaction gate (it would just reject the follow). */}
      <View style={[styles.followContainer, { backgroundColor: theme.card }]}>
        <TouchableOpacity
          style={[
            styles.followButton,
            profile.isFollowing && [styles.followingButton, { borderColor: colors.primary[600] }],
            (followLoading || isBlocked) && styles.followDisabled,
          ]}
          onPress={handleFollowToggle}
          disabled={followLoading || isBlocked}
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
      <View style={[styles.listingsHeader, { backgroundColor: theme.background }]}>
        <Text style={[styles.listingsTitle, { color: theme.text }]}>Anúncios ({profile.listingCount})</Text>
      </View>
    </View>
  );

  return (
    <FlatList
      style={[styles.container, { backgroundColor: theme.background }]}
      data={listings}
      numColumns={2}
      keyExtractor={(item) => item.id}
      columnWrapperStyle={styles.row}
      renderItem={renderItem}
      ListHeaderComponent={headerComponent}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="pricetags-outline" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Nenhum anúncio publicado</Text>
        </View>
      }
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      windowSize={11}
      initialNumToRender={8}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  blockedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1,
  },
  blockedBannerText: { fontSize: 13, flex: 1, lineHeight: 18 },
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
