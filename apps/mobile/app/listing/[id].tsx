import {
  View, Text, ScrollView, Image, StyleSheet, TouchableOpacity, Dimensions,
  ActivityIndicator, Alert, TextInput, Modal, Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useFavorites } from '../../src/contexts/FavoritesContext';
import { getListing } from '../../src/services/listings';
import { startConversation } from '../../src/services/messages';
import type { Listing } from '../../src/services/listings';
import { getDemoListing, DEMO_PHOTOS, startDemoConversation } from '../../src/services/demoStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CONDITION_LABELS: Record<string, string> = {
  NEW_WITH_TAGS: 'Novo com etiqueta',
  NEW_WITHOUT_TAGS: 'Novo sem etiqueta',
  VERY_GOOD: 'Excelente',
  GOOD: 'Bom',
  SATISFACTORY: 'Satisfatório',
};

const formatBrl = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const APP_URL = 'https://vintage.br';

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { isFavorited, toggleFavorite } = useFavorites();
  const [loading, setLoading] = useState(true);
  const [listing, setListing] = useState<Listing | null>(null);
  const [offerModalVisible, setOfferModalVisible] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerLoading, setOfferLoading] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const favorited = listing ? isFavorited(listing.id) : false;

  useEffect(() => {
    async function fetchListing() {
      try {
        const data = await getListing(id ?? '');
        setListing(data);
      } catch {
        const demoListing = getDemoListing(id ?? '');
        if (demoListing) {
          setListing(demoListing);
        } else {
          setListing({
            id: id ?? '1',
            title: 'Vestido Zara tamanho M',
            description: 'Vestido preto fluido, usado 2 vezes, sem defeitos. Tecido leve, ideal para o verão. Excelente estado de conservação.',
            priceBrl: 89.9,
            condition: 'VERY_GOOD',
            size: 'M',
            color: 'Preto',
            images: [
              { id: 'img1', url: DEMO_PHOTOS[0], order: 0 },
              { id: 'img2', url: DEMO_PHOTOS[1], order: 1 },
              { id: 'img3', url: DEMO_PHOTOS[2], order: 2 },
            ],
            seller: { id: 'seller1', name: 'Maria Silva', rating: 4.8 },
            category: 'Moda Feminina',
            brand: 'Zara',
            viewCount: 42,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      } finally {
        setLoading(false);
      }
    }
    fetchListing();
  }, [id]);

  const handleToggleFavorite = async () => {
    if (!listing) return;
    await toggleFavorite(listing.id);
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
      // Start (or continue) a conversation thread and send offer as a special message
      let conv;
      const offerBody = `💰 Oferta: R$ ${formatBrl(amount)}\n\nOlá! Gostaria de comprar "${listing.title}" por R$ ${formatBrl(amount)}.`;
      try {
        conv = await startConversation(listing.id, offerBody);
      } catch {
        conv = startDemoConversation(listing.id, listing.title, listing.seller.id, listing.seller.name, offerBody);
      }
      setOfferModalVisible(false);
      setOfferAmount('');
      // Navigate to the conversation so the user sees the offer thread
      router.push(`/conversation/${conv.id}?participantName=${encodeURIComponent(listing.seller.name)}&isOffer=1&offerAmount=${amount}&listingId=${listing.id}`);
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar a oferta. Tente novamente.');
    } finally {
      setOfferLoading(false);
    }
  };

  const handleMessage = async () => {
    if (!listing) return;
    const firstMsg = `Olá! Tenho interesse no "${listing.title}".`;
    try {
      const conv = await startConversation(listing.id, firstMsg);
      router.push(`/conversation/${conv.id}?participantName=${encodeURIComponent(listing.seller.name)}`);
    } catch {
      const conv = startDemoConversation(listing.id, listing.title, listing.seller.id, listing.seller.name, firstMsg);
      router.push(`/conversation/${conv.id}?participantName=${encodeURIComponent(listing.seller.name)}`);
    }
  };

  const getShareUrl = () => `${APP_URL}/listing/${listing?.id ?? ''}`;

  const handleShare = async () => {
    if (!listing) return;
    const url = getShareUrl();
    const message = `${listing.title} por R$ ${formatBrl(listing.priceBrl)} no Vintage.br`;
    try {
      await Share.share({ message: `${message}\n${url}`, url, title: listing.title });
    } catch {
      // user cancelled or error
    }
  };

  if (loading || !listing) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  const buyerProtectionFee = 3.5 + listing.priceBrl * 0.05;
  const subtotal = listing.priceBrl + buyerProtectionFee;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Image Carousel */}
        <View style={[styles.imageContainer, { backgroundColor: theme.cardSecondary }]}>
          {listing.images.length > 0 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                  setCurrentImageIndex(idx);
                }}
              >
                {listing.images.map((img, i) => (
                  <ScrollView
                    key={i}
                    style={styles.zoomScroll}
                    maximumZoomScale={3}
                    minimumZoomScale={1}
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                    centerContent
                  >
                    <Image source={{ uri: img.url }} style={styles.image} resizeMode="cover" />
                  </ScrollView>
                ))}
              </ScrollView>
              {listing.images.length > 1 && (
                <View style={styles.imageDots}>
                  {listing.images.map((_, i) => (
                    <View key={i} style={[styles.dot, i === currentImageIndex && styles.dotActive]} />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]}>
              <Ionicons name="image-outline" size={64} color={theme.textTertiary} />
              <Text style={[styles.placeholderText, { color: theme.textTertiary }]}>Sem fotos</Text>
            </View>
          )}
        </View>

        {/* Price + Favorite + Share */}
        <View style={[styles.priceRow, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
          <Text style={[styles.price, { color: theme.text }]}>R$ {formatBrl(listing.priceBrl)}</Text>
          <View style={styles.priceActions}>
            <TouchableOpacity onPress={handleShare} style={styles.iconButton}>
              <Ionicons name="share-outline" size={26} color={theme.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleToggleFavorite} style={styles.iconButton}>
              <Ionicons
                name={favorited ? 'heart' : 'heart-outline'}
                size={28}
                color={favorited ? colors.error[500] : theme.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Title + Details */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.title, { color: theme.text }]}>{listing.title}</Text>
          <View style={styles.tags}>
            {listing.brand && <Text style={[styles.tag, { color: theme.textSecondary, backgroundColor: theme.cardSecondary }]}>{listing.brand}</Text>}
            {listing.size && <Text style={[styles.tag, { color: theme.textSecondary, backgroundColor: theme.cardSecondary }]}>Tam. {listing.size}</Text>}
            {listing.condition && (
              <Text style={[styles.tag, { color: theme.textSecondary, backgroundColor: theme.cardSecondary }]}>{CONDITION_LABELS[listing.condition]}</Text>
            )}
            {listing.color && <Text style={[styles.tag, { color: theme.textSecondary, backgroundColor: theme.cardSecondary }]}>{listing.color}</Text>}
          </View>
        </View>

        {/* Description */}
        <View style={[styles.section, { backgroundColor: theme.card, marginTop: 8 }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Descrição</Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>{listing.description}</Text>
        </View>

        {/* Cost Breakdown — postage calculated at checkout */}
        <View style={[styles.section, { backgroundColor: theme.card, marginTop: 8 }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Resumo</Text>
          <View style={styles.costRow}>
            <Text style={[styles.costLabel, { color: theme.textSecondary }]}>Item</Text>
            <Text style={[styles.costValue, { color: theme.textSecondary }]}>R$ {formatBrl(listing.priceBrl)}</Text>
          </View>
          <View style={styles.costRow}>
            <Text style={[styles.costLabel, { color: theme.textSecondary }]}>Proteção ao comprador</Text>
            <Text style={[styles.costValue, { color: theme.textSecondary }]}>R$ {formatBrl(buyerProtectionFee)}</Text>
          </View>
          <View style={[styles.costRow, styles.totalRow, { borderTopColor: theme.border }]}>
            <Text style={[styles.totalLabel, { color: theme.text }]}>Subtotal</Text>
            <Text style={[styles.totalValue, { color: colors.primary[600] }]}>R$ {formatBrl(subtotal)}</Text>
          </View>
          <Text style={[styles.shippingNote, { color: theme.textTertiary }]}>Frete calculado no checkout</Text>
        </View>

        {/* Seller */}
        <TouchableOpacity
          style={[styles.sellerCard, { backgroundColor: theme.card }]}
          onPress={() => router.push(`/seller/${listing.seller.id}`)}
        >
          <View style={[styles.sellerAvatar, { backgroundColor: theme.cardSecondary }]}>
            <Ionicons name="person" size={24} color={theme.textTertiary} />
          </View>
          <View style={styles.sellerInfo}>
            <View style={styles.sellerNameRow}>
              <Text style={[styles.sellerName, { color: theme.text }]}>{listing.seller.name}</Text>
            </View>
            {listing.seller.rating && (
              <View style={styles.sellerRating}>
                <Ionicons name="star" size={14} color={colors.warning[500]} />
                <Text style={[styles.ratingText, { color: theme.textSecondary }]}>{listing.seller.rating}</Text>
              </View>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
        </TouchableOpacity>

        {/* Stats */}
        <View style={styles.stats}>
          <Text style={[styles.statText, { color: theme.textTertiary }]}>
            <Ionicons name="eye-outline" size={14} /> {listing.viewCount} visualizações
          </Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={[styles.bottomBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        <TouchableOpacity style={[styles.messageButton, { borderColor: colors.primary[200] }]} onPress={handleMessage}>
          <Ionicons name="chatbubble-outline" size={22} color={colors.primary[600]} />
          <Text style={styles.messageText}>Mensagem</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.offerButton, { borderColor: colors.primary[600] }]} onPress={() => setOfferModalVisible(true)}>
          <Text style={styles.offerText}>Fazer oferta</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.buyButton} onPress={handleBuy}>
          <Text style={styles.buyText}>Comprar agora</Text>
        </TouchableOpacity>
      </View>

      {/* Offer Modal */}
      <Modal visible={offerModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Fazer oferta</Text>
            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Preço original: R$ {formatBrl(listing.priceBrl)}
            </Text>
            <View style={styles.offerInputRow}>
              <Text style={[styles.offerPrefix, { color: theme.text }]}>R$</Text>
              <TextInput
                style={[styles.offerInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
                placeholder="0,00"
                placeholderTextColor={theme.textTertiary}
                value={offerAmount}
                onChangeText={setOfferAmount}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalCancel, { borderColor: theme.border }]}
                onPress={() => { setOfferModalVisible(false); setOfferAmount(''); }}
              >
                <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, offerLoading && styles.modalConfirmDisabled]}
                onPress={handleOffer}
                disabled={offerLoading}
              >
                <Text style={styles.modalConfirmText}>{offerLoading ? 'Enviando...' : 'Enviar oferta'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  imageContainer: {},
  image: { width: SCREEN_WIDTH, aspectRatio: 4 / 5 },
  zoomScroll: { width: SCREEN_WIDTH },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  placeholderText: { marginTop: 8 },
  imageDots: {
    position: 'absolute', bottom: 10, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: '#ffffff', width: 18 },
  priceRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  price: { fontSize: 24, fontWeight: '700' },
  priceActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: { padding: 4 },
  section: {
    paddingHorizontal: 16, paddingVertical: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '600' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: {
    fontSize: 12, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 6, overflow: 'hidden',
  },
  description: { fontSize: 14, lineHeight: 22 },
  shippingNote: { fontSize: 12, marginTop: 6 },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  costLabel: { fontSize: 14 },
  costValue: { fontSize: 14 },
  totalRow: { borderTopWidth: 1, marginTop: 8, paddingTop: 8 },
  totalLabel: { fontSize: 16, fontWeight: '700' },
  totalValue: { fontSize: 16, fontWeight: '700' },
  sellerCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, marginTop: 8,
  },
  sellerAvatar: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  sellerInfo: { flex: 1, marginLeft: 12 },
  sellerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sellerName: { fontSize: 15, fontWeight: '600' },
  sellerRating: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  ratingText: { fontSize: 13 },
  stats: { flexDirection: 'row', justifyContent: 'center', gap: 24, paddingVertical: 16 },
  statText: { fontSize: 13 },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 28,
    borderTopWidth: 1,
  },
  messageButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1,
  },
  messageText: { fontSize: 13, color: colors.primary[600], fontWeight: '500' },
  offerButton: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, alignItems: 'center',
  },
  offerText: { fontSize: 14, fontWeight: '600', color: colors.primary[600] },
  buyButton: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: colors.primary[600], alignItems: 'center',
  },
  buyText: { fontSize: 14, fontWeight: '600', color: colors.neutral[0] },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  modalSubtitle: { fontSize: 14, marginTop: 4, marginBottom: 20 },
  offerInputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  offerPrefix: { fontSize: 20, fontWeight: '600', marginRight: 8 },
  offerInput: {
    flex: 1, height: 50, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 16, fontSize: 18,
  },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1, height: 50, borderRadius: 12, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, fontWeight: '500' },
  modalConfirm: {
    flex: 1, height: 50, borderRadius: 12, backgroundColor: colors.primary[600],
    justifyContent: 'center', alignItems: 'center',
  },
  modalConfirmDisabled: { opacity: 0.6 },
  modalConfirmText: { fontSize: 15, color: colors.neutral[0], fontWeight: '600' },
});
