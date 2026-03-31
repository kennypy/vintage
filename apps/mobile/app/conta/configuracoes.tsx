import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';

const NOTIF_PREFS_KEY = 'vintage_notif_prefs';

interface NotifPrefs {
  push: boolean;
  email: boolean;
  sms: boolean;
}

async function loadNotifPrefs(): Promise<NotifPrefs> {
  try {
    const raw = await SecureStore.getItemAsync(NOTIF_PREFS_KEY);
    if (raw) return JSON.parse(raw) as NotifPrefs;
  } catch {}
  return { push: true, email: true, sms: false };
}

async function saveNotifPrefs(prefs: NotifPrefs): Promise<void> {
  try {
    await SecureStore.setItemAsync(NOTIF_PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

export default function ConfiguracoesScreen() {
  const { theme, mode, setMode } = useTheme();

  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const darkMode = mode === 'dark' || (mode === 'system' && theme.isDark);

  useEffect(() => {
    loadNotifPrefs().then((prefs) => {
      setPushEnabled(prefs.push);
      setEmailEnabled(prefs.email);
      setSmsEnabled(prefs.sms);
      setPrefsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    saveNotifPrefs({ push: pushEnabled, email: emailEnabled, sms: smsEnabled });
  }, [pushEnabled, emailEnabled, smsEnabled, prefsLoaded]);

  const handleToggleDark = (value: boolean) => {
    setMode(value ? 'dark' : 'light');
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Excluir conta',
      'Tem certeza que deseja excluir sua conta? Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => {} },
      ],
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Notificações</Text>
        <View style={[styles.row, { borderBottomColor: theme.divider }]}>
          <Ionicons name="notifications-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Notificações push</Text>
          <Switch
            value={pushEnabled}
            onValueChange={setPushEnabled}
            trackColor={{ true: colors.primary[500] }}
            thumbColor={pushEnabled ? '#fff' : '#fff'}
          />
        </View>
        <View style={[styles.row, { borderBottomColor: theme.divider }]}>
          <Ionicons name="mail-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>E-mail</Text>
          <Switch
            value={emailEnabled}
            onValueChange={setEmailEnabled}
            trackColor={{ true: colors.primary[500] }}
            thumbColor={emailEnabled ? '#fff' : '#fff'}
          />
        </View>
        <View style={[styles.row, { borderBottomColor: theme.divider }]}>
          <Ionicons name="chatbox-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>SMS</Text>
          <Switch
            value={smsEnabled}
            onValueChange={setSmsEnabled}
            trackColor={{ true: colors.primary[500] }}
            thumbColor={smsEnabled ? '#fff' : '#fff'}
          />
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Aparência</Text>
        <View style={[styles.row, { borderBottomColor: theme.divider }]}>
          <Ionicons name="moon-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Modo escuro</Text>
          <Switch
            value={darkMode}
            onValueChange={handleToggleDark}
            trackColor={{ true: colors.primary[500] }}
            thumbColor={darkMode ? '#fff' : '#fff'}
          />
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Privacidade</Text>
        <TouchableOpacity style={[styles.row, { borderBottomColor: theme.divider }]}>
          <Ionicons name="lock-closed-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Alterar senha</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.row, { borderBottomColor: theme.divider }]}>
          <Ionicons name="eye-off-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Perfil privado</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.row, { borderBottomColor: theme.divider }]}>
          <Ionicons name="document-text-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Termos de uso</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.row, { borderBottomColor: theme.divider }]}>
          <Ionicons name="shield-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Política de privacidade</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
        <Text style={styles.deleteButtonText}>Excluir minha conta</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  rowLabel: { flex: 1, fontSize: 15 },
  deleteButton: {
    margin: 16, paddingVertical: 14, alignItems: 'center',
    borderRadius: 12, borderWidth: 1, borderColor: colors.error[400],
  },
  deleteButtonText: { color: colors.error[500], fontSize: 15, fontWeight: '500' },
});
