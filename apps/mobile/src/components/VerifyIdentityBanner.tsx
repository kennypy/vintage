import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '../theme/colors';
import { useAuth } from '../contexts/AuthContext';
import { getProfile } from '../services/users';

/**
 * Persistent banner shown at the top of the home tab for signed-in users
 * who have not yet completed CPF identity verification. Dismiss is
 * in-memory only (re-appears on next launch) — the friction is
 * intentional: unverified sellers can't list, so the banner doubles as
 * onboarding guidance.
 */
export function VerifyIdentityBanner() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [verified, setVerified] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    getProfile()
      .then((p) => setVerified(p.cpfIdentityVerified ?? false))
      .catch(() => setVerified(null));
  }, [isAuthenticated]);

  if (!isAuthenticated || verified === null || verified === true || dismissed) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Ionicons name="shield-checkmark-outline" size={22} color="#fff" />
      <View style={styles.body}>
        <Text style={styles.title}>Verifique seu CPF</Text>
        <Text style={styles.subtitle}>
          Ganhe o selo Vintage.br Verificado para vender e receber com confiança.
        </Text>
      </View>
      <TouchableOpacity
        style={styles.cta}
        onPress={() => router.push('/conta/verificacao')}
      >
        <Text style={styles.ctaText}>Verificar</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setDismissed(true)} style={styles.dismiss}>
        <Ionicons name="close" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.primary[600],
    padding: 12,
  },
  body: { flex: 1 },
  title: { color: '#fff', fontSize: 13, fontWeight: '700' },
  subtitle: { color: colors.primary[100], fontSize: 11, marginTop: 2 },
  cta: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  ctaText: { color: colors.primary[700], fontSize: 12, fontWeight: '700' },
  dismiss: { padding: 4 },
});
