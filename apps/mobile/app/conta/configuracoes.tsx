import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, Alert, Linking, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';

export default function ConfiguracoesScreen() {
  const router = useRouter();
  const { theme, mode, setMode, fullScreen, setFullScreen } = useTheme();
  const { signOut, user } = useAuth();
  // OAuth accounts land here with `cpf: null`. Show a prominent "add CPF"
  // row so they can link one before hitting a flow that requires it.
  const cpfMissing = !user?.cpf;

  const [deleting, setDeleting] = useState(false);

  const darkMode = mode === 'dark' || (mode === 'system' && theme.isDark);

  const handleToggleDark = (value: boolean) => {
    setMode(value ? 'dark' : 'light');
  };

  // Navigates to the dedicated confirm-and-delete screen. That screen
  // collects password / emailCode + the typed-EXCLUIR safety gate
  // before POSTing — doing it inline here bypassed server-side auth
  // checks for accounts without passwords.
  const handleDeleteAccount = () => {
    router.push('/conta/deletar-conta');
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Notificações</Text>
        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push('/conta/notificacoes')}
        >
          <Ionicons name="notifications-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Preferências de notificação</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
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
        <View style={[styles.row, { borderBottomColor: theme.divider }]}>
          <Ionicons name="expand-outline" size={22} color={theme.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: theme.text, flex: 0 }]}>Tela cheia</Text>
            <Text style={{ fontSize: 12, color: theme.textTertiary }}>Oculta a barra de navegação do Android</Text>
          </View>
          <Switch
            value={fullScreen}
            onValueChange={setFullScreen}
            trackColor={{ true: colors.primary[500] }}
            thumbColor={fullScreen ? '#fff' : '#fff'}
          />
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Privacidade</Text>
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: theme.divider }]}
          onPress={() => router.push('/conta/alterar-email')}
        >
          <Ionicons name="mail-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Alterar email</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: theme.divider }]}
          onPress={() => router.push('/conta/alterar-senha')}
        >
          <Ionicons name="lock-closed-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Alterar senha</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: theme.divider }]}
          onPress={() => router.push('/conta/seguranca')}
        >
          <Ionicons name="shield-checkmark-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Segurança e 2FA</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: theme.divider }]}
          onPress={() => router.push('/conta/cpf')}
          accessibilityRole="button"
        >
          <Ionicons
            name={cpfMissing ? 'alert-circle-outline' : 'finger-print-outline'}
            size={22}
            color={cpfMissing ? colors.warning[600] : theme.textSecondary}
          />
          <Text style={[styles.rowLabel, { color: theme.text }]}>
            {cpfMissing ? 'Adicionar CPF' : 'CPF'}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: theme.divider }]}
          onPress={() => router.push('/conta/blocked-users')}
        >
          <Ionicons name="ban-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Usuários bloqueados</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: theme.divider }]}
          onPress={() => router.push('/conta/payout-methods')}
        >
          <Ionicons name="card-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Chaves PIX (saques)</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: theme.divider }]}
          onPress={() => Alert.alert('Perfil privado', 'Em breve você poderá tornar seu perfil privado.')}
        >
          <Ionicons name="eye-off-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Perfil privado</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: theme.divider }]}
          onPress={() => router.push('/legal/termos')}
        >
          <Ionicons name="document-text-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Termos de uso</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: theme.divider }]}
          onPress={() => router.push('/legal/privacidade')}
        >
          <Ionicons name="shield-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Política de privacidade</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: theme.divider }]}
          onPress={() => router.push('/legal/diretrizes-comunidade')}
        >
          <Ionicons name="people-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Diretrizes da comunidade</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: theme.divider }]}
          onPress={() => router.push('/legal/sobre')}
        >
          <Ionicons name="information-circle-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Sobre a Vintage.br</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.row, { borderBottomColor: theme.divider }]}
          onPress={() => router.push('/legal/press')}
        >
          <Ionicons name="newspaper-outline" size={22} color={theme.textSecondary} />
          <Text style={[styles.rowLabel, { color: theme.text }]}>Imprensa</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount} disabled={deleting}>
        {deleting ? (
          <ActivityIndicator color={colors.error[500]} />
        ) : (
          <Text style={styles.deleteButtonText}>Excluir minha conta</Text>
        )}
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
