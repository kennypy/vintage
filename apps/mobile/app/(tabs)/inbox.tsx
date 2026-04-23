import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { getConversations } from '../../src/services/messages';
import type { Conversation } from '../../src/services/messages';
import { getAllDemoConversations, isDemoModeSync } from '../../src/services/demoStore';
import { useAuth } from '../../src/contexts/AuthContext';

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

function InboxAuthGate() {
  const router = useRouter();
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Ionicons name="chatbubble-outline" size={48} color={colors.primary[500]} />
      <Text style={{ fontSize: 18, fontWeight: '600', color: theme.text, marginTop: 16, textAlign: 'center' }}>
        Entre para ver suas mensagens
      </Text>
      <Text style={{ fontSize: 14, color: theme.textSecondary, marginTop: 8, textAlign: 'center' }}>
        Faça login para conversar com vendedores e compradores.
      </Text>
      <TouchableOpacity
        onPress={() => router.push('/(auth)/login')}
        style={{ marginTop: 24, backgroundColor: colors.primary[600], paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 }}
      >
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Entrar / Cadastrar</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function InboxScreen() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <InboxAuthGate />;
  return <InboxScreenContent />;
}

function InboxScreenContent() {
  const router = useRouter();
  const { theme } = useTheme();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Inline error state — previously a failed GET /conversations
  // silently served demo conversations, so a logged-in user with no
  // real messages couldn't tell "I have no messages" from "API is
  // down".
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    setFetchError(null);
    try {
      const response = await getConversations();
      setConversations(response.items);
    } catch (error) {
      if (isDemoModeSync()) {
        setConversations(getAllDemoConversations());
      } else {
        setConversations([]);
        setFetchError(
          error instanceof Error && error.message
            ? error.message
            : 'Não foi possível carregar suas mensagens.',
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useFocusEffect(
    useCallback(() => {
      fetchConversations();
    }, [fetchConversations]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  }, [fetchConversations]);

  const handleConversationPress = useCallback((conversation: Conversation) => {
    router.push(`/conversation/${conversation.id}?participantName=${encodeURIComponent(conversation.participant.name)}`);
  }, [router]);

  const renderItem = useCallback(({ item }: { item: Conversation }) => (
    <TouchableOpacity
      style={[styles.conversationItem, { backgroundColor: theme.card, borderBottomColor: theme.border }]}
      onPress={() => handleConversationPress(item)}
    >
      <View style={styles.avatar}>
        <View style={[styles.avatarPlaceholder, { backgroundColor: theme.inputBg }]}>
          <Ionicons name="person" size={20} color={theme.textTertiary} />
        </View>
        {item.unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{item.unreadCount}</Text>
          </View>
        )}
      </View>
      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text style={[styles.participantName, { color: theme.text }, item.unreadCount > 0 && styles.unreadName]} numberOfLines={1}>
            {item.participant.name}
          </Text>
          <Text style={[styles.timeText, { color: theme.textTertiary }]}>{formatTimeAgo(item.lastMessageAt)}</Text>
        </View>
        <Text style={styles.listingTitle} numberOfLines={1}>
          {item.listingTitle}
        </Text>
        <Text
          style={[styles.lastMessage, { color: theme.textSecondary }, item.unreadCount > 0 && styles.unreadMessage]}
          numberOfLines={1}
        >
          {item.lastMessage}
        </Text>
      </View>
    </TouchableOpacity>
  ), [theme, handleConversationPress]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          fetchError ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={64} color={colors.error[500]} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Erro ao carregar mensagens</Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{fetchError}</Text>
              <TouchableOpacity
                onPress={fetchConversations}
                style={{ marginTop: 16, paddingVertical: 8, paddingHorizontal: 16 }}
              >
                <Text style={{ color: colors.primary[600], fontSize: 14, fontWeight: '600' }}>Tentar novamente</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={64} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Nenhuma mensagem</Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                Suas conversas com compradores e vendedores aparecerão aqui.
              </Text>
            </View>
          )
        }
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={11}
        initialNumToRender={8}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  conversationItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: { position: 'relative', marginRight: 12 },
  avatarPlaceholder: {
    width: 48, height: 48, borderRadius: 24,
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
  participantName: { fontSize: 15, fontWeight: '500', flex: 1 },
  unreadName: { fontWeight: '700' },
  timeText: { fontSize: 12, marginLeft: 8 },
  listingTitle: { fontSize: 12, color: colors.primary[600], marginTop: 2 },
  lastMessage: { fontSize: 13, marginTop: 2 },
  unreadMessage: { fontWeight: '600' },
  empty: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32, paddingTop: 120,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 14, textAlign: 'center' },
});
