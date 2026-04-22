import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import {
  getBundle,
  removeBundleItem,
  checkoutBundle,
  type Bundle,
} from '../../src/services/bundles';

const formatBrl = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BundleDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setBundle(await getBundle(id));
    } catch {
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = (listingId: string) => {
    if (!bundle) return;
    Alert.alert('Remover item', 'Remover este anúncio do pacote?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeBundleItem(bundle.id, listingId);
            load();
          } catch {
            Alert.alert('Erro', 'Não foi possível remover o item.');
          }
        },
      },
    ]);
  };

  const handleCheckout = () => {
    if (!bundle) return;
    router.push({
      pathname: '/checkout',
      params: { bundleId: bundle.id },
    });
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary[500]} />;
  if (!bundle) return <Text style={styles.empty}>Pacote não encontrado.</Text>;

  const subtotal = bundle.items.reduce((s, it) => s + Number(it.listing.priceBrl), 0);
  const open = bundle.status === 'OPEN';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Pacote</Text>
      <Text style={styles.subtitle}>
        {bundle.items.length} {bundle.items.length === 1 ? 'item' : 'itens'} · frete combinado
      </Text>

      <View style={styles.items}>
        {bundle.items.map((it) => {
          const url = it.listing.images[0]?.url;
          return (
            <View key={it.id} style={styles.item}>
              {url ? (
                <Image source={{ uri: url }} style={styles.img} />
              ) : (
                <View style={[styles.img, styles.imgPh]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={2}>
                  {it.listing.title}
                </Text>
                <Text style={styles.itemPrice}>{formatBrl(Number(it.listing.priceBrl))}</Text>
              </View>
              {open && (
                <TouchableOpacity onPress={() => remove(it.listingId)} style={styles.remove}>
                  <Ionicons name="close-circle-outline" size={22} color={colors.neutral[400]} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{formatBrl(subtotal)}</Text>
        </View>
      </View>

      {open && (
        <TouchableOpacity
          style={[styles.btn, checkingOut && { opacity: 0.6 }]}
          disabled={checkingOut || bundle.items.length < 2}
          onPress={handleCheckout}
        >
          {checkingOut ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Finalizar pacote</Text>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  title: { fontSize: 22, fontWeight: '700', color: colors.neutral[900] },
  subtitle: { color: colors.neutral[600], marginTop: 4, marginBottom: 16 },
  empty: { textAlign: 'center', padding: 32, color: colors.neutral[500] },
  items: { gap: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.neutral[0],
    padding: 12,
    borderRadius: 12,
  },
  img: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.neutral[200] },
  imgPh: {},
  itemTitle: { fontSize: 14, fontWeight: '600', color: colors.neutral[900] },
  itemPrice: { fontSize: 14, color: colors.primary[600], marginTop: 4, fontWeight: '700' },
  remove: { padding: 4 },
  summary: { marginTop: 16, backgroundColor: colors.neutral[0], padding: 14, borderRadius: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 14, color: colors.neutral[700] },
  summaryValue: { fontSize: 14, fontWeight: '700', color: colors.neutral[900] },
  btn: {
    marginTop: 16,
    backgroundColor: colors.primary[500],
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
