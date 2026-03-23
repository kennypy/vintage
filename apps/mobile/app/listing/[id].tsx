import {
  View, Text, ScrollView, Image, StyleSheet, TouchableOpacity, Dimensions,
  ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { getListing, toggleFavorite as toggleFavoriteApi } from '../../src/services/listings';
import { makeOffer } from '../../src/services/offers';
import { startConversation } from '../../src/services/messages';
import type { Listing } from '../../src/services/listings';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CONDITION_LABELS: Record<string, string> = {
  NEW_WITH_TAGS: 'Novo com etiqueta',
  NEW_WITHOUT_TAGS: 'Novo sem etiqueta',
  VERY_GOOD: 'Muito bom',
  GOOD: 'Bom',
  SATISFACTORY: 'Satisfatório',
};

const formatBrl = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listing, setListing] = useState<Listing | null>(null);
  const [offerModalVisible, setOfferModalVisible] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerLoading, setOfferLoading] = useState(false);

  useEffect(() => {
    async function fetchListing() {
      try {
        const data = await getListing(id ?? '');
        setListing(data);
        setFavorited(data.isFavorited ?? false);
      } catch (_error) {
        // Fallback mock data
        setListing({
          id: id ?? '1',
          title: 'Vestido Zara tamanho M',
          description: 'Vestido preto, usado 2 vezes, sem defeitos. Tecido leve, ideal para o verão.',
          priceBrl: 89.9,
          condition: 'VERY_GOOD',
          size: 'M',
          color: 'Preto',
          images: [],
          seller: { id: 'seller1', name: 'Maria Silva', rating: 4.8 },
          category: 'Vestidos',
          brand: 'Zara',
          viewCount: 42,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } finally {
        setLoading(false);
      }
    }
    fetchListing();
  }, [id]);

  const handleToggleFavorite = async () => {
    if (!listing) return;
    setFavorited(!favorited);
    try {
      await toggleFavoriteApi(listing.id);
    } catch (_error) {
      setFavorited(favorited);
    }
  };

  const handleBuy = () => {
    if (!listing) return;
    router.push({
      pathname: '/checkout',
      params: {
        listingId: listing.id,
        title: listing.title,
        priceBrl: String(listing.priceBrl),
        imageUrl: listing.images[0]?.url ?? '',
      },
    });
  };

  const handleOffer = async () => {
    if (!listing) return;
    const amount = parseFloat(offerAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor válido para a oferta.');
      return;
    }

    setOfferLoading(true);
    try {
      await makeOffer(listing.id, amount);
      setOfferModalVisible(false);
      setOfferAmount('');
      Alert.alert('Oferta enviada!', `Sua oferta de R$ ${formatBrl(amount)} foi enviada ao vendedor.`);
    } catch (_error) {
      Alert.alert('Erro', 'Não foi possível enviar a oferta. Tente novamente.');
    } finally {
      setOfferLoading(false);
    }
  };

  const handleMessage = async () => {
    if (!listing) return;
    try {
      await startConversation(listing.id, `Olá! Tenho interesse no "${listing.title}".`);
      Alert.alert('Mensagem enviada', 'Sua mensagem foi enviada ao vendedor.');
    } catch (_error) {
      Alert.alert('Erro', 'Não foi possível iniciar a conversa. Tente novamente.');
    }
  };

  if (loading || !listing) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  const buyerProtectionFee = 3.5 + listing.priceBrl * 0.05;
  const shippingEstimate = 18.9;
  const total = listing.priceBrl + shippingEstimate + buyerProtectionFee;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Image Carousel */}
        <View style={styles.imageContainer}>
          {listing.images.length > 0 ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {listing.images.map((img, i) => (
                <Image key={i} source={{ uri: img.url }} style={styles.image} resizeMode="cover" />
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]}>
              <Ionicons name="image-outline" size={64} color={colors.neutral[300]} />
              <Text style={styles.placeholderText}>Sem fotos</Text>
            </View>
          )}
        </View>

        {/* Price + Actions */}
        <View style={styles.priceRow}>
          <Text style={styles.price}>R$ {formatBrl(listing.priceBrl)}</Text>
          <TouchableOpacity onPress={handleToggleFavorite}>
            <Ionicons
              name={favorited ? 'heart' : 'heart-outline'}
              size={28}
              color={favorited ? colors.error[500] : colors.neutral[400]}
            />
          </TouchableOpacity>
        </View>

        {/* Title + Details */}
        <View style={styles.section}>
          <Text style={styles.title}>{listing.title}</Text>
          <View style={styles.tags}>
            {listing.brand && <Text style={styles.tag}>{listing.brand}</Text>}
            {listing.size && <Text style={styles.tag}>Tam. {listing.size}</Text>}
            {listing.condition && (
              <Text style={styles.tag}>{CONDITION_LABELS[listing.condition]}</Text>
            )}
            {listing.color && <Text style={styles.tag}>{listing.color}</Text>}
          </View>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Descrição</Text>
          <Text style={styles.description}>{listing.description}</Text>
        </View>

        {/* Cost Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumo</Text>
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Item</Text>
            <Text style={styles.costValue}>R$ {formatBrl(listing.priceBrl)}</Text>
          </View>
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Frete (estimado)</Text>
            <Text style={styles.costValue}>R$ {formatBrl(shippingEstimate)}</Text>
          </View>
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Proteção ao comprador</Text>
            <Text style={styles.costValue}>R$ {formatBrl(buyerProtectionFee)}</Text>
          </View>
          <View style={[styles.costRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>R$ {formatBrl(total)}</Text>
          </View>
        </View>

        {/* Seller */}
        <TouchableOpacity
          style={styles.sellerCard}
          onPress={() => router.push(`/seller/${listing.seller.id}`)}
        >
          <View style={styles.sellerAvatar}>
            <Ionicons name="person" size={24} color={colors.neutral[400]} />
          </View>
          <View style={styles.sellerInfo}>
            <View style={styles.sellerNameRow}>
              <Text style={styles.sellerName}>{listing.seller.name}</Text>
            </View>
            {listing.seller.rating && (
              <View style={styles.sellerRating}>
                <Ionicons name="star" size={14} color={colors.warning[500]} />
                <Text style={styles.ratingText}>{listing.seller.rating}</Text>
              </View>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.neutral[400]} />
        </TouchableOpacity>

        {/* Stats */}
        <View style={styles.stats}>
          <Text style={styles.statText}>
            <Ionicons name="eye-outline" size={14} /> {listing.viewCount} visualizações
          </Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.messageButton} onPress={handleMessage}>
          <Ionicons name="chatbubble-outline" size={22} color={colors.primary[600]} />
          <Text style={styles.messageText}>Mensagem</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.offerButton} onPress={() => setOfferModalVisible(true)}>
          <Text style={styles.offerText}>Fazer oferta</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.buyButton} onPress={handleBuy}>
          <Text style={styles.buyText}>Comprar agora</Text>
        </TouchableOpacity>
      </View>

      {/* Offer Modal */}
      <Modal visible={offerModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Fazer oferta</Text>
            <Text style={styles.modalSubtitle}>
              Preço original: R$ {formatBrl(listing.priceBrl)}
            </Text>
            <View style={styles.offerInputRow}>
              <Text style={styles.offerPrefix}>R$</Text>
              <TextInput
                style={styles.offerInput}
                placeholder="0,00"
                placeholderTextColor={colors.neutral[400]}
                value={offerAmount}
                onChangeText={setOfferAmount}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setOfferModalVisible(false);
                  setOfferAmount('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, offerLoading && styles.modalConfirmDisabled]}
                onPress={handleOffer}
                disabled={offerLoading}
              >
                <Text style={styles.modalConfirmText}>
                  {offerLoading ? 'Enviando...' : 'Enviar oferta'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  centered: { justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  imageContainer: { backgroundColor: colors.neutral[100] },
  image: { width: SCREEN_WIDTH, aspectRatio: 4 / 5 },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  placeholderText: { color: colors.neutral[400], marginTop: 8 },
  priceRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: colors.neutral[0],
  },
  price: { fontSize: 24, fontWeight: '700', color: colors.neutral[900] },
  section: {
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: colors.neutral[0],
    marginTop: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.neutral[900], marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '600', color: colors.neutral[900] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: {
    fontSize: 12, color: colors.neutral[600],
    backgroundColor: colors.neutral[100], paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 6, overflow: 'hidden',
  },
  description: { fontSize: 14, color: colors.neutral[600], lineHeight: 22 },
  costRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 4,
  },
  costLabel: { fontSize: 14, color: colors.neutral[500] },
  costValue: { fontSize: 14, color: colors.neutral[700] },
  totalRow: {
    borderTopWidth: 1, borderTopColor: colors.neutral[200],
    marginTop: 8, paddingTop: 8,
  },
  totalLabel: { fontSize: 16, fontWeight: '700', color: colors.neutral[900] },
  totalValue: { fontSize: 16, fontWeight: '700', color: colors.primary[600] },
  sellerCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: colors.neutral[0], marginTop: 8,
  },
  sellerAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.neutral[100],
    justifyContent: 'center', alignItems: 'center',
  },
  sellerInfo: { flex: 1, marginLeft: 12 },
  sellerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sellerName: { fontSize: 15, fontWeight: '600', color: colors.neutral[900] },
  sellerRating: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  ratingText: { fontSize: 13, color: colors.neutral[500] },
  stats: {
    flexDirection: 'row', justifyContent: 'center', gap: 24,
    paddingVertical: 16,
  },
  statText: { fontSize: 13, color: colors.neutral[400] },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    paddingBottom: 28,
    backgroundColor: colors.neutral[0],
    borderTopWidth: 1, borderTopColor: colors.neutral[200],
  },
  messageButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1, borderColor: colors.primary[200],
  },
  messageText: { fontSize: 13, color: colors.primary[600], fontWeight: '500' },
  offerButton: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: colors.primary[600],
    alignItems: 'center',
  },
  offerText: { fontSize: 14, fontWeight: '600', color: colors.primary[600] },
  buyButton: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: colors.primary[600], alignItems: 'center',
  },
  buyText: { fontSize: 14, fontWeight: '600', color: colors.neutral[0] },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.neutral[0], borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.neutral[900] },
  modalSubtitle: { fontSize: 14, color: colors.neutral[500], marginTop: 4, marginBottom: 20 },
  offerInputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  offerPrefix: { fontSize: 20, fontWeight: '600', color: colors.neutral[700], marginRight: 8 },
  offerInput: {
    flex: 1, height: 50, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: 12,
    paddingHorizontal: 16, fontSize: 18, color: colors.neutral[900], backgroundColor: colors.neutral[50],
  },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1, height: 50, borderRadius: 12, borderWidth: 1, borderColor: colors.neutral[200],
    justifyContent: 'center', alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, color: colors.neutral[600], fontWeight: '500' },
  modalConfirm: {
    flex: 1, height: 50, borderRadius: 12, backgroundColor: colors.primary[600],
    justifyContent: 'center', alignItems: 'center',
  },
  modalConfirmDisabled: { opacity: 0.6 },
  modalConfirmText: { fontSize: 15, color: colors.neutral[0], fontWeight: '600' },
});
