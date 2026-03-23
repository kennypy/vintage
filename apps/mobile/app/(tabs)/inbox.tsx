import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { getConversations } from '../../src/services/messages';
import type { Conversation } from '../../src/services/messages';

function formatTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function InboxScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const response = await getConversations();
      setConversations(response.items);
    } catch (_error) {
      // Keep empty on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  }, [fetchConversations]);

  const handleConversationPress = (conversation: Conversation) => {
    router.push(`/conversation/${conversation.id}?participantName=${encodeURIComponent(conversation.participant.name)}`);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.conversationItem}
            onPress={() => handleConversationPress(item)}
          >
            <View style={styles.avatar}>
              {item.participant.avatarUrl ? (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={20} color={colors.neutral[400]} />
                </View>
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={20} color={colors.neutral[400]} />
                </View>
              )}
              {item.unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{item.unreadCount}</Text>
                </View>
              )}
            </View>
            <View style={styles.conversationContent}>
              <View style={styles.conversationHeader}>
                <Text style={[styles.participantName, item.unreadCount > 0 && styles.unreadName]} numberOfLines={1}>
                  {item.participant.name}
                </Text>
                <Text style={styles.timeText}>{formatTimeAgo(item.lastMessageAt)}</Text>
              </View>
              <Text style={styles.listingTitle} numberOfLines={1}>
                {item.listingTitle}
              </Text>
              <Text
                style={[styles.lastMessage, item.unreadCount > 0 && styles.unreadMessage]}
                numberOfLines={1}
              >
                {item.lastMessage}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={64} color={colors.neutral[300]} />
            <Text style={styles.emptyTitle}>Nenhuma mensagem</Text>
            <Text style={styles.emptyText}>
              Suas conversas com compradores e vendedores aparecerão aqui.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  centered: { justifyContent: 'center', alignItems: 'center' },
  conversationItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    backgroundColor: colors.neutral[0],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.neutral[200],
  },
  avatar: { position: 'relative', marginRight: 12 },
  avatarPlaceholder: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.neutral[100],
    justifyContent: 'center', alignItems: 'center',
  },
  unreadBadge: {
    position: 'absolute', top: -2, right: -2,
    backgroundColor: colors.primary[600], borderRadius: 10,
    minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 4,
  },
  unreadText: { color: colors.neutral[0], fontSize: 11, fontWeight: '700' },
  conversationContent: { flex: 1 },
  conversationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  participantName: { fontSize: 15, fontWeight: '500', color: colors.neutral[800], flex: 1 },
  unreadName: { fontWeight: '700' },
  timeText: { fontSize: 12, color: colors.neutral[400], marginLeft: 8 },
  listingTitle: { fontSize: 12, color: colors.primary[600], marginTop: 2 },
  lastMessage: { fontSize: 13, color: colors.neutral[500], marginTop: 2 },
  unreadMessage: { fontWeight: '600', color: colors.neutral[700] },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 120,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.neutral[900],
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.neutral[400],
    textAlign: 'center',
  },
});
