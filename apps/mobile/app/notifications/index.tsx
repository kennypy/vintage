import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { getNotifications, markRead, markAllRead } from '../../src/services/notifications';
import type { AppNotification } from '../../src/services/notifications';

const NOTIFICATION_ICONS: Record<string, string> = {
  order: 'bag-outline',
  offer: 'pricetag-outline',
  message: 'chatbubble-outline',
  follow: 'person-add-outline',
  review: 'star-outline',
  system: 'information-circle-outline',
};

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

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await getNotifications();
      setNotifications(response.items);
      setUnreadCount(response.unreadCount);
    } catch (_error) {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  }, [fetchNotifications]);

  const handleNotificationPress = async (notification: AppNotification) => {
    if (!notification.read) {
      try {
        await markRead(notification.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (_error) {
        // Silently fail
      }
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (_error) {
      // Silently fail
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {unreadCount > 0 && (
        <TouchableOpacity
          style={[styles.markAllButton, { backgroundColor: theme.card, borderBottomColor: theme.border }]}
          onPress={handleMarkAllRead}
        >
          <Text style={styles.markAllText}>Marcar todas como lidas</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.notificationItem,
              { backgroundColor: item.read ? theme.card : colors.primary[50] + '50', borderBottomColor: theme.border },
            ]}
            onPress={() => handleNotificationPress(item)}
          >
            <View style={[
              styles.iconContainer,
              { backgroundColor: !item.read ? colors.primary[100] : theme.inputBg },
            ]}>
              <Ionicons
                name={(NOTIFICATION_ICONS[item.type] ?? 'notifications-outline') as any}
                size={22}
                color={!item.read ? colors.primary[600] : theme.textTertiary}
              />
            </View>
            <View style={styles.notificationContent}>
              <Text style={[styles.notificationTitle, { color: theme.text }, !item.read && styles.notificationTitleUnread]}>
                {item.title}
              </Text>
              <Text style={[styles.notificationBody, { color: theme.textSecondary }]} numberOfLines={2}>
                {item.body}
              </Text>
              <Text style={[styles.notificationTime, { color: theme.textTertiary }]}>{formatTimeAgo(item.createdAt)}</Text>
            </View>
            {!item.read && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={64} color={theme.textTertiary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Nenhuma notificação</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Suas notificações aparecerão aqui.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  markAllButton: {
    paddingVertical: 10, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'flex-end',
  },
  markAllText: { fontSize: 14, color: colors.primary[600], fontWeight: '500' },
  notificationItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconContainer: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  notificationContent: { flex: 1 },
  notificationTitle: { fontSize: 14, fontWeight: '500' },
  notificationTitleUnread: { fontWeight: '700' },
  notificationBody: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  notificationTime: { fontSize: 12, marginTop: 4 },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary[600],
    marginLeft: 8,
  },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptyText: { fontSize: 14, marginTop: 4 },
});
