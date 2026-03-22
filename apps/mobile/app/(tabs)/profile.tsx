import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';

export default function ProfileScreen() {
  // TODO: Check auth state, show login if not authenticated
  return (
    <ScrollView style={styles.container}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarPlaceholder}>
          <Ionicons name="person" size={40} color={colors.neutral[400]} />
        </View>
        <Text style={styles.name}>Entrar ou Cadastrar</Text>
      </View>

      <View style={styles.section}>
        <MenuItem icon="wallet-outline" label="Carteira" />
        <MenuItem icon="heart-outline" label="Favoritos" />
        <MenuItem icon="bag-outline" label="Minhas compras" />
        <MenuItem icon="pricetag-outline" label="Meus anúncios" />
        <MenuItem icon="star-outline" label="Avaliações" />
      </View>

      <View style={styles.section}>
        <MenuItem icon="settings-outline" label="Configurações" />
        <MenuItem icon="airplane-outline" label="Modo férias" />
        <MenuItem icon="help-circle-outline" label="Ajuda" />
      </View>
    </ScrollView>
  );
}

function MenuItem({ icon, label }: { icon: string; label: string }) {
  return (
    <TouchableOpacity style={menuStyles.item}>
      <Ionicons name={icon as any} size={22} color={colors.neutral[600]} />
      <Text style={menuStyles.label}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: colors.neutral[0],
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary[600],
  },
  section: {
    marginTop: 16,
    backgroundColor: colors.neutral[0],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.neutral[200],
  },
});

const menuStyles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.neutral[200],
  },
  label: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: colors.neutral[800],
  },
});
