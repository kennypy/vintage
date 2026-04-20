import {
  View, Text, StyleSheet, Switch, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { apiFetch } from '../../src/services/api';

/**
 * Mirrors the web's NotificationPreferences shape
 * (apps/web/src/app/notifications/page.tsx). 2 channel toggles + 7
 * category toggles. All defaults are true server-side; we start the
 * local mirror with the same defaults so the toggles render sensibly
 * during the initial fetch.
 *
 * Transactional messages (order receipts, verification, password reset,
 * email change, account-deletion code) ignore `emailEnabled` by design
 * — a UX note below the email toggle explains this so users aren't
 * surprised when they still get a receipt after disabling email.
 */
interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  orders: boolean;
  messages: boolean;
  offers: boolean;
  followers: boolean;
  priceDrops: boolean;
  promotions: boolean;
  news: boolean;
}

const DEFAULT_PREFS: NotificationPreferences = {
  pushEnabled: true,
  emailEnabled: true,
  orders: true,
  messages: true,
  offers: true,
  followers: true,
  priceDrops: true,
  promotions: true,
  news: true,
};

type ChannelKey = 'pushEnabled' | 'emailEnabled';
type CategoryKey = Exclude<keyof NotificationPreferences, ChannelKey>;

const CATEGORY_ROWS: Array<{
  key: CategoryKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: 'orders', label: 'Pedidos', icon: 'cube-outline' },
  { key: 'messages', label: 'Mensagens', icon: 'chatbubble-outline' },
  { key: 'offers', label: 'Ofertas', icon: 'pricetag-outline' },
  { key: 'followers', label: 'Novos seguidores', icon: 'person-add-outline' },
  { key: 'priceDrops', label: 'Queda de preço em favoritos', icon: 'trending-down-outline' },
  { key: 'promotions', label: 'Promoções', icon: 'gift-outline' },
  { key: 'news', label: 'Novidades da plataforma', icon: 'newspaper-outline' },
];

export default function NotificacoesScreen() {
  const { theme } = useTheme();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<NotificationPreferences>(
        '/users/me/notification-preferences',
      );
      setPrefs(data);
    } catch (_err) {
      // Leave DEFAULT_PREFS in place so the UI still renders — the
      // toggle action will retry on the next tap.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Single-flight toggle: optimistic UI, rollback on failure. We don't
  // debounce because taps on these switches are infrequent by nature
  // (settings screen), and treating each toggle as an atomic PATCH
  // keeps the server as the source of truth.
  const toggle = useCallback(
    async (key: keyof NotificationPreferences, next: boolean) => {
      setSaving(true);
      const previous = prefs[key];
      setPrefs((p) => ({ ...p, [key]: next }));
      try {
        const patched = await apiFetch<NotificationPreferences>(
          '/users/me/notification-preferences',
          { method: 'PATCH', body: JSON.stringify({ [key]: next }) },
        );
        setPrefs(patched);
      } catch (_err) {
        setPrefs((p) => ({ ...p, [key]: previous }));
        Alert.alert(
          'Não foi possível salvar',
          'Verifique sua conexão e tente novamente.',
        );
      } finally {
        setSaving(false);
      }
    },
    [prefs],
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Notificações' }} />
        <ActivityIndicator color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen options={{ title: 'Notificações' }} />

      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Canais</Text>

        <View style={[styles.row, { borderBottomColor: theme.divider }]}>
          <Ionicons name="notifications-outline" size={22} color={theme.textSecondary} />
          <View style={styles.labelCol}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Notificações push</Text>
            <Text style={[styles.rowHint, { color: theme.textTertiary }]}>
              Alertas no celular quando o app está fechado.
            </Text>
          </View>
          <Switch
            value={prefs.pushEnabled}
            onValueChange={(v) => toggle('pushEnabled', v)}
            disabled={saving}
            trackColor={{ true: colors.primary[500] }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.row}>
          <Ionicons name="mail-outline" size={22} color={theme.textSecondary} />
          <View style={styles.labelCol}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>E-mails</Text>
            <Text style={[styles.rowHint, { color: theme.textTertiary }]}>
              Recibo de pedido, verificação de e-mail e recuperação de senha sempre são enviados.
            </Text>
          </View>
          <Switch
            value={prefs.emailEnabled}
            onValueChange={(v) => toggle('emailEnabled', v)}
            disabled={saving}
            trackColor={{ true: colors.primary[500] }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Categorias</Text>
        {CATEGORY_ROWS.map((row, idx) => (
          <View
            key={row.key}
            style={[
              styles.row,
              idx < CATEGORY_ROWS.length - 1 && { borderBottomColor: theme.divider },
            ]}
          >
            <Ionicons name={row.icon} size={22} color={theme.textSecondary} />
            <Text style={[styles.rowLabel, { color: theme.text }]}>{row.label}</Text>
            <Switch
              value={prefs[row.key]}
              onValueChange={(v) => toggle(row.key, v)}
              disabled={saving}
              trackColor={{ true: colors.primary[500] }}
              thumbColor="#fff"
            />
          </View>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: {
    marginTop: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '600',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  labelCol: { flex: 1 },
  rowLabel: { flex: 1, fontSize: 15 },
  rowHint: { fontSize: 12, marginTop: 2 },
});
