import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { EmptyState } from '../../src/components/EmptyState';
import { StarRating } from '../../src/components/StarRating';
import { getReviews, Review } from '../../src/services/reviews';

export default function ReviewsScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  const fetchReviews = useCallback(async (pageNum: number, isRefresh = false) => {
    if (!userId) return;
    try {
      const data = await getReviews(userId, pageNum);
      if (isRefresh || pageNum === 1) {
        setReviews(data.items);
      } else {
        setReviews((prev) => [...prev, ...data.items]);
      }
      setTotal(data.total);
      setHasMore(pageNum < data.totalPages);
    } catch (_error) {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchReviews(1);
  }, [fetchReviews]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    fetchReviews(1, true);
  }, [fetchReviews]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchReviews(nextPage);
  }, [hasMore, loading, page, fetchReviews]);

  const formatTimeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 30) return `${diffDays} dias atrás`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} meses atrás`;
    return `${Math.floor(diffDays / 365)} anos atrás`;
  };

  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  const renderReview = ({ item }: { item: Review }) => (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewer}>
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={16} color={colors.neutral[400]} />
          </View>
          <Text style={styles.reviewerName}>{item.reviewerName}</Text>
        </View>
        <Text style={styles.reviewDate}>{formatTimeAgo(item.createdAt)}</Text>
      </View>
      <StarRating rating={item.rating} size={16} />
      {item.comment && (
        <Text style={styles.reviewComment}>{item.comment}</Text>
      )}
      {item.imageUrls && item.imageUrls.length > 0 && (
        <View style={styles.imagesRow}>
          {item.imageUrls.map((url) => (
            <Image key={url} source={{ uri: url }} style={styles.reviewImage} />
          ))}
        </View>
      )}
      {item.sellerReply && (
        <View style={styles.replyBox}>
          <View style={styles.replyHeader}>
            <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.primary[600]} />
            <Text style={styles.replyLabel}>Resposta do vendedor</Text>
            {item.sellerReplyAt && (
              <Text style={styles.replyDate}>{formatTimeAgo(item.sellerReplyAt)}</Text>
            )}
          </View>
          <Text style={styles.replyText}>{item.sellerReply}</Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  if (reviews.length === 0) {
    return (
      <EmptyState
        icon="star-outline"
        title="Nenhuma avaliação ainda"
        subtitle="As avaliações aparecerão aqui após as compras"
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <Text style={styles.avgRating}>{averageRating.toFixed(1)}</Text>
        <StarRating rating={Math.round(averageRating)} size={24} />
        <Text style={styles.totalReviews}>
          {total} {total === 1 ? 'avaliação' : 'avaliações'}
        </Text>
      </View>

      <FlatList
        data={reviews}
        renderItem={renderReview}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary[500]} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={11}
        initialNumToRender={8}
      />
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
  summaryCard: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  avgRating: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.neutral[900],
  },
  totalReviews: {
    fontSize: 14,
    color: colors.neutral[500],
    marginTop: 6,
  },
  list: {
    padding: 16,
  },
  reviewCard: {
    backgroundColor: colors.neutral[50],
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.neutral[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewerName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.neutral[800],
  },
  reviewDate: {
    fontSize: 12,
    color: colors.neutral[500],
  },
  reviewComment: {
    fontSize: 14,
    color: colors.neutral[700],
    marginTop: 8,
    lineHeight: 20,
  },
  imagesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  reviewImage: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: colors.neutral[200],
  },
  replyBox: {
    marginTop: 10,
    backgroundColor: colors.primary[50],
    borderLeftWidth: 3,
    borderLeftColor: colors.primary[400],
    borderRadius: 6,
    padding: 10,
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  replyLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary[700],
    flex: 1,
  },
  replyDate: {
    fontSize: 11,
    color: colors.neutral[400],
  },
  replyText: {
    fontSize: 13,
    color: colors.neutral[700],
    lineHeight: 18,
  },
});
