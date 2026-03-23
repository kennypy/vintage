import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { getProfile } from '../../src/services/users';
import { logout } from '../../src/services/auth';
import { getToken } from '../../src/services/api';
import type { UserProfile } from '../../src/services/users';

export default function ProfileScreen() {
  const router = useRouter();
  const [vacationMode, setVacationMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);

  const checkAuthAndFetch = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }
      setIsAuthenticated(true);
      const profile = await getProfile();
      setUser(profile);
    } catch (_error) {
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthAndFetch();
  }, [checkAuthAndFetch]);

  const handleLogout = async () => {
    Alert.alert('Sair da conta', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await logout();
          setIsAuthenticated(false);
          setUser(null);
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleWithdraw = () => {
    router.push('/wallet');
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <View style={styles.authContainer}>
        <Text style={styles.authTitle}>Entre para continuar</Text>
        <TouchableOpacity
          style={styles.authButton}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.authButtonText}>Entrar ou Cadastrar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const formatBalance = (value: number) =>
    value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarPlaceholder}>
          <Ionicons name="person" size={36} color={colors.neutral[400]} />
        </View>
        <View style={styles.profileInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{user.name}</Text>
            {user.verified && (
              <Ionicons name="checkmark-circle" size={18} color={colors.primary[500]} />
            )}
          </View>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color={colors.warning[500]} />
            <Text style={styles.ratingText}>{user.ratingAvg} ({user.ratingCount})</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.editButton}>
          <Ionicons name="create-outline" size={20} color={colors.primary[600]} />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{user.listingCount}</Text>
          <Text style={styles.statLabel}>Anúncios</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{user.followerCount}</Text>
          <Text style={styles.statLabel}>Seguidores</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{user.followingCount}</Text>
          <Text style={styles.statLabel}>Seguindo</Text>
        </View>
      </View>

      {/* Wallet Card */}
      <TouchableOpacity style={styles.walletCard} onPress={() => router.push('/wallet')}>
        <View style={styles.walletLeft}>
          <Ionicons name="wallet-outline" size={24} color={colors.primary[600]} />
          <View>
            <Text style={styles.walletLabel}>Carteira</Text>
            <Text style={styles.walletBalance}>
              R$ {formatBalance(user.walletBalance)}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.withdrawButton} onPress={handleWithdraw}>
          <Text style={styles.withdrawText}>Sacar via PIX</Text>
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Menu Sections */}
      <View style={styles.menuSection}>
        <Text style={styles.menuSectionTitle}>Compras e Vendas</Text>
        <MenuItem icon="bag-outline" label="Minhas compras" onPress={() => router.push('/orders')} />
        <MenuItem icon="pricetag-outline" label="Meus anúncios" />
        <MenuItem icon="heart-outline" label="Favoritos" />
        <MenuItem icon="chatbubble-outline" label="Ofertas recebidas" onPress={() => router.push('/offers')} />
        <MenuItem icon="star-outline" label="Avaliações" />
      </View>

      <View style={styles.menuSection}>
        <Text style={styles.menuSectionTitle}>Promoções</Text>
        <MenuItem icon="megaphone-outline" label="Megafone" badge="Grátis" />
        <MenuItem icon="rocket-outline" label="Impulsionar anúncio" />
        <MenuItem icon="sparkles-outline" label="Destaque da loja" />
      </View>

      <View style={styles.menuSection}>
        <Text style={styles.menuSectionTitle}>Conta</Text>
        <View style={styles.menuItem}>
          <Ionicons name="airplane-outline" size={22} color={colors.neutral[600]} />
          <Text style={styles.menuLabel}>Modo férias</Text>
          <Switch
            value={vacationMode}
            onValueChange={setVacationMode}
            trackColor={{ true: colors.primary[500] }}
          />
        </View>
        <MenuItem icon="notifications-outline" label="Notificações" onPress={() => router.push('/notifications')} />
        <MenuItem icon="location-outline" label="Endereços" />
        <MenuItem icon="shield-checkmark-outline" label="Verificação" />
        <MenuItem icon="settings-outline" label="Configurações" />
        <MenuItem icon="help-circle-outline" label="Ajuda" />
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sair da conta</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function MenuItem({ icon, label, badge, onPress }: { icon: string; label: string; badge?: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon as any} size={22} color={colors.neutral[600]} />
      <Text style={styles.menuLabel}>{label}</Text>
      {badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  loadingContainer: { justifyContent: 'center', alignItems: 'center' },
  authContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  authTitle: { fontSize: 20, fontWeight: '600', color: colors.neutral[900], marginBottom: 16 },
  authButton: { backgroundColor: colors.primary[600], paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  authButtonText: { color: colors.neutral[0], fontSize: 16, fontWeight: '600' },
  profileHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    backgroundColor: colors.neutral[0], borderBottomWidth: 1, borderBottomColor: colors.neutral[200],
  },
  avatarPlaceholder: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.neutral[100],
    justifyContent: 'center', alignItems: 'center',
  },
  profileInfo: { flex: 1, marginLeft: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 18, fontWeight: '700', color: colors.neutral[900] },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ratingText: { fontSize: 13, color: colors.neutral[500] },
  editButton: { padding: 8 },
  statsRow: {
    flexDirection: 'row', backgroundColor: colors.neutral[0], paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.neutral[200],
  },
  stat: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 18, fontWeight: '700', color: colors.neutral[900] },
  statLabel: { fontSize: 12, color: colors.neutral[500], marginTop: 2 },
  statDivider: { width: 1, backgroundColor: colors.neutral[200] },
  walletCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    margin: 12, padding: 16, backgroundColor: colors.primary[50],
    borderRadius: 14, borderWidth: 1, borderColor: colors.primary[200],
  },
  walletLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  walletLabel: { fontSize: 12, color: colors.neutral[500] },
  walletBalance: { fontSize: 20, fontWeight: '700', color: colors.primary[700] },
  withdrawButton: { backgroundColor: colors.pix, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  withdrawText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  menuSection: {
    backgroundColor: colors.neutral[0], marginTop: 12,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.neutral[200],
  },
  menuSectionTitle: { fontSize: 13, fontWeight: '600', color: colors.neutral[400], paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.neutral[200], gap: 12,
  },
  menuLabel: { flex: 1, fontSize: 15, color: colors.neutral[800] },
  badge: { backgroundColor: colors.success[500], paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  logoutButton: { margin: 16, paddingVertical: 14, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.error[500] },
  logoutText: { color: colors.error[500], fontSize: 15, fontWeight: '500' },
});
