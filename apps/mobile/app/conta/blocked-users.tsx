import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Image, RefreshControl,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import {
  listBlockedUsers, unblockUser, type BlockSummary,
} from '../../src/services/moderation';
import { ApiError } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';

export default function BlockedUsersScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { isAuthenticated, isDemoMode } = useAuth();
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Track per-row pending state so concurrent unblocks on different rows
  // don't lock the whole list.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    // Unauthenticated (logged out) users have no blocks list — bounce to
    // login instead of hitting the API, since /users/me/blocks requires a
    // real JWT. Demo users keep rendering (empty list) because their data
    // is local and they should still see settings pages without redirect.
    if (!isAuthenticated && !isDemoMode) {
      router.replace('/(auth)/login');
      return;
    }
    try {
      const data = await listBlockedUsers();
      setBlocks(data.items);
    } catch (err) {
      // 401 → session expired, bounce to login. Other errors → keep state.
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/(auth)/login');
        return;
      }
      // Keep previous state on transient errors
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, isDemoMode, router]);

  useEffect(() => { refresh(); }, [refresh]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleUnblock = (item: BlockSummary) => {
    Alert.alert(
      'Desbloquear usuário',
      `${item.name} poderá enviar mensagens e ofertas para você novamente.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desbloquear',
          onPress: async () => {
            setPendingIds((prev) => new Set(prev).add(item.userId));
            try {
              await unblockUser(item.userId);
              setBlocks((prev) => prev.filter((b) => b.userId !== item.userId));
            } catch (err) {
              const msg = err instanceof ApiError && err.message ? err.message : 'Falha ao desbloquear.';
              Alert.alert('Erro', msg);
            } finally {
              setPendingIds((prev) => {
                const next = new Set(prev);
                next.delete(item.userId);
                return next;
              });
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Usuários bloqueados' }} />
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <FlatList
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={[
        blocks.length === 0 ? styles.emptyContent : styles.listContent,
      ]}
      data={blocks}
      keyExtractor={(item) => item.userId}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <>
          <Stack.Screen options={{ title: 'Usuários bloqueados' }} />
          {blocks.length > 0 && (
            <Text style={[styles.help, { color: theme.textSecondary }]}>
              Usuários bloqueados não podem enviar mensagens, ofertas ou comprar seus anúncios.
              Eles não são avisados do bloqueio.
            </Text>
          )}
        </>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="ban-outline" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Nenhum usuário bloqueado</Text>
          <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
            Use o menu ··· no perfil de um usuário para bloqueá-lo.
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const pending = pendingIds.has(item.userId);
        return (
          <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <TouchableOpacity
              style={styles.rowMain}
              onPress={() => router.push(`/seller/${item.userId}`)}
              accessibilityRole="button"
              accessibilityLabel={`Ver perfil de ${item.name}`}
            >
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.cardSecondary }]}>
                  <Ionicons name="person" size={20} color={theme.textTertiary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.blockedAt, { color: theme.textTertiary }]}>
                  Bloqueado em {new Date(item.blockedAt).toLocaleDateString('pt-BR')}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.unblockBtn, pending && styles.disabledBtn]}
              onPress={() => handleUnblock(item)}
              disabled={pending}
              accessibilityRole="button"
            >
              {pending ? (
                <ActivityIndicator size="small" color={colors.primary[600]} />
              ) : (
                <Text style={[styles.unblockBtnText, { color: colors.primary[600] }]}>Desbloquear</Text>
              )}
            </TouchableOpacity>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, gap: 8 },
  emptyContent: { flexGrow: 1 },
  help: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '600' },
  blockedAt: { fontSize: 12, marginTop: 2 },
  unblockBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  unblockBtnText: { fontSize: 14, fontWeight: '600' },
  disabledBtn: { opacity: 0.5 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  emptyDesc: { fontSize: 13, textAlign: 'center' },
});
