import {
  View, Text, StyleSheet, Switch, ScrollView, ActivityIndicator, Alert,
  TouchableOpacity, AppState,
} from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { apiFetch } from '../../src/services/api';
import {
  getNotificationPermissionStatus,
  openOsSettings,
} from '../../src/services/permissions';

/**
 * Mirrors the web's NotificationPreferences shape
 * (apps/web/src/app/notifications/page.tsx). 2 channel toggles + 9
 * category toggles + daily-limit knob. All defaults are true server-side;
 * we start the local mirror with the same defaults so the toggles render
 * sensibly during the initial fetch.
 *
 * Transactional messages (order receipts, verification, password reset,
 * email change, account-deletion code) ignore `emailEnabled` by design
 * — a UX note below the email toggle explains this so users aren't
 * surprised when they still get a receipt after disabling email.
 *
 * The "Push" channel toggle is flanked by a live read of the OS
 * permission. If the user has revoked permission at the OS level, the
 * in-app toggle is still stored (so re-enabling at OS level resumes
 * push) but we surface "Desativado nas configurações do sistema" with
 * an "Abrir configurações" button — otherwise the user is stuck flipping
 * a toggle that can't take effect.
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
  reviews: boolean;
  favorites: boolean;
  dailyCap: number;
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
  reviews: true,
  favorites: true,
  dailyCap: 0,
};

type ChannelKey = 'pushEnabled' | 'emailEnabled';
type CategoryKey =
  | 'orders' | 'messages' | 'offers' | 'followers'
  | 'priceDrops' | 'promotions' | 'news' | 'reviews' | 'favorites';

const CATEGORY_ROWS: Array<{
  key: CategoryKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: 'messages', label: 'Mensagens', icon: 'chatbubble-outline' },
  { key: 'orders', label: 'Pedidos', icon: 'cube-outline' },
  { key: 'offers', label: 'Ofertas', icon: 'pricetag-outline' },
  { key: 'reviews', label: 'Avaliações', icon: 'star-outline' },
  { key: 'priceDrops', label: 'Queda de preço em favoritos', icon: 'trending-down-outline' },
  { key: 'favorites', label: 'Favoritos e novos itens', icon: 'heart-outline' },
  { key: 'followers', label: 'Novos seguidores', icon: 'person-add-outline' },
  { key: 'promotions', label: 'Promoções', icon: 'gift-outline' },
  { key: 'news', label: 'Novidades da plataforma', icon: 'newspaper-outline' },
];

// Daily push cap presets — Vinted offers "Up to 2" as the visible
// default, we match that with a couple more options. 0 = unlimited.
const DAILY_CAP_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Sem limite' },
  { value: 2, label: 'Até 2 por dia' },
  { value: 5, label: 'Até 5 por dia' },
  { value: 10, label: 'Até 10 por dia' },
];

export default function NotificacoesScreen() {
  const { theme } = useTheme();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [osPushStatus, setOsPushStatus] = useState<'granted' | 'denied' | 'undetermined'>('granted');
  const [capOpen, setCapOpen] = useState(false);
  const appStateSubRef = useRef<{ remove: () => void } | null>(null);

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

  const refreshOsStatus = useCallback(async () => {
    const s = await getNotificationPermissionStatus();
    setOsPushStatus(s);
  }, []);

  useEffect(() => {
    load();
    refreshOsStatus();
    // Re-check OS status when the user returns from the Settings app —
    // otherwise the "Desativado nas configurações" banner stays stale
    // after they flip it back on.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refreshOsStatus();
    });
    appStateSubRef.current = sub;
    return () => { sub.remove(); };
  }, [load, refreshOsStatus]);

  // Single-flight toggle: optimistic UI, rollback on failure. We don't
  // debounce because taps on these switches are infrequent by nature
  // (settings screen), and treating each toggle as an atomic PATCH
  // keeps the server as the source of truth.
  const toggle = useCallback(
    async (key: ChannelKey | CategoryKey, next: boolean) => {
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

  const setDailyCap = useCallback(async (value: number) => {
    setCapOpen(false);
    setSaving(true);
    const previous = prefs.dailyCap;
    setPrefs((p) => ({ ...p, dailyCap: value }));
    try {
      const patched = await apiFetch<NotificationPreferences>(
        '/users/me/notification-preferences',
        { method: 'PATCH', body: JSON.stringify({ dailyCap: value }) },
      );
      setPrefs(patched);
    } catch (_err) {
      setPrefs((p) => ({ ...p, dailyCap: previous }));
      Alert.alert(
        'Não foi possível salvar',
        'Verifique sua conexão e tente novamente.',
      );
    } finally {
      setSaving(false);
    }
  }, [prefs.dailyCap]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Notificações' }} />
        <ActivityIndicator color={colors.primary[500]} />
      </View>
    );
  }

  const osBlocksPush = osPushStatus !== 'granted' && prefs.pushEnabled;
  const currentCapLabel =
    DAILY_CAP_OPTIONS.find((o) => o.value === prefs.dailyCap)?.label ?? 'Sem limite';

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

        {osBlocksPush && (
          <TouchableOpacity
            style={[styles.banner, { backgroundColor: theme.background, borderColor: theme.border }]}
            onPress={() => openOsSettings().catch(() => {})}
          >
            <Ionicons name="alert-circle" size={18} color={colors.primary[500]} />
            <Text style={[styles.bannerText, { color: theme.text }]}>
              Push desativado nas configurações do sistema. Toque para abrir.
            </Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </TouchableOpacity>
        )}

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

      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Limite diário</Text>
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: theme.divider }]}
          onPress={() => setCapOpen((v) => !v)}
          disabled={saving}
        >
          <Ionicons name="timer-outline" size={22} color={theme.textSecondary} />
          <View style={styles.labelCol}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Pushes por categoria, por dia</Text>
            <Text style={[styles.rowHint, { color: theme.textTertiary }]}>
              Acima do limite, a entrada ainda aparece na lista, mas o celular não toca.
            </Text>
          </View>
          <Text style={[styles.rowValue, { color: theme.textSecondary }]}>{currentCapLabel}</Text>
          <Ionicons
            name={capOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={theme.textTertiary}
          />
        </TouchableOpacity>
        {capOpen &&
          DAILY_CAP_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.row, { borderBottomColor: theme.divider }]}
              onPress={() => setDailyCap(opt.value)}
              disabled={saving}
            >
              <Ionicons
                name={prefs.dailyCap === opt.value ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={
                  prefs.dailyCap === opt.value ? colors.primary[500] : theme.textSecondary
                }
              />
              <Text style={[styles.rowLabel, { color: theme.text }]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
      </View>

      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>
          Configurações do sistema
        </Text>
        <TouchableOpacity
          style={styles.row}
          onPress={() => openOsSettings().catch(() => {})}
        >
          <Ionicons name="settings-outline" size={22} color={theme.textSecondary} />
          <View style={styles.labelCol}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Abrir configurações do app</Text>
            <Text style={[styles.rowHint, { color: theme.textTertiary }]}>
              Permissões de câmera, fotos, microfone e notificações ficam no sistema.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
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
  rowValue: { fontSize: 14 },
  banner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginVertical: 8,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1, gap: 8,
  },
  bannerText: { flex: 1, fontSize: 13 },
});
