import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';

export default function ConfiguracoesScreen() {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

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
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notificações</Text>
        <View style={styles.row}>
          <Ionicons name="notifications-outline" size={22} color={colors.neutral[600]} />
          <Text style={styles.rowLabel}>Notificações push</Text>
          <Switch
            value={pushEnabled}
            onValueChange={setPushEnabled}
            trackColor={{ true: colors.primary[500] }}
          />
        </View>
        <View style={styles.row}>
          <Ionicons name="mail-outline" size={22} color={colors.neutral[600]} />
          <Text style={styles.rowLabel}>E-mail</Text>
          <Switch
            value={emailEnabled}
            onValueChange={setEmailEnabled}
            trackColor={{ true: colors.primary[500] }}
          />
        </View>
        <View style={styles.row}>
          <Ionicons name="chatbox-outline" size={22} color={colors.neutral[600]} />
          <Text style={styles.rowLabel}>SMS</Text>
          <Switch
            value={smsEnabled}
            onValueChange={setSmsEnabled}
            trackColor={{ true: colors.primary[500] }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Aparência</Text>
        <View style={styles.row}>
          <Ionicons name="moon-outline" size={22} color={colors.neutral[600]} />
          <Text style={styles.rowLabel}>Modo escuro</Text>
          <Switch
            value={darkMode}
            onValueChange={setDarkMode}
            trackColor={{ true: colors.primary[500] }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacidade</Text>
        <TouchableOpacity style={styles.row}>
          <Ionicons name="lock-closed-outline" size={22} color={colors.neutral[600]} />
          <Text style={styles.rowLabel}>Alterar senha</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.row}>
          <Ionicons name="eye-off-outline" size={22} color={colors.neutral[600]} />
          <Text style={styles.rowLabel}>Perfil privado</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.row}>
          <Ionicons name="document-text-outline" size={22} color={colors.neutral[600]} />
          <Text style={styles.rowLabel}>Termos de uso</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.row}>
          <Ionicons name="shield-outline" size={22} color={colors.neutral[600]} />
          <Text style={styles.rowLabel}>Política de privacidade</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />
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
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  section: {
    backgroundColor: colors.neutral[0], marginTop: 12,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.neutral[200],
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: colors.neutral[400],
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.neutral[200], gap: 12,
  },
  rowLabel: { flex: 1, fontSize: 15, color: colors.neutral[800] },
  deleteButton: {
    margin: 16, paddingVertical: 14, alignItems: 'center',
    borderRadius: 12, borderWidth: 1, borderColor: colors.error[400],
  },
  deleteButtonText: { color: colors.error[500], fontSize: 15, fontWeight: '500' },
});
