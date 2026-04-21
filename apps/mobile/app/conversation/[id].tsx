import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { uploadListingImage } from '../../src/services/listings';
import {
  View,
  Text,
  Image,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { io, Socket } from 'socket.io-client';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { getToken } from '../../src/services/api';
import { getMessages, sendMessage, Message } from '../../src/services/messages';
import { getDemoMessages, addDemoMessage } from '../../src/services/demoStore';

// EXPO_PUBLIC_API_URL includes the REST prefix (e.g. `.../api/v1`). Socket.IO
// treats the path segment of the URL as the namespace, so passing the full
// value here makes the client ask for namespace `/api/v1/chat` instead of
// `/chat` — the server rejects it and real-time messaging silently dies.
// Strip a trailing `/api/v<n>` (and any trailing slash) before handing the
// origin to `io()`; the `/chat` namespace is appended below.
const SOCKET_ORIGIN = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001')
  .replace(/\/+$/, '')
  .replace(/\/api\/v\d+$/, '');

const formatBrl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ConversationScreen() {
  const { id, participantName, isOffer, offerAmount, listingId, listingTitle } = useLocalSearchParams<{
    id: string;
    participantName?: string;
    isOffer?: string;
    offerAmount?: string;
    listingId?: string;
    listingTitle?: string;
  }>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Offer state (local, for demo purposes)
  const [pendingOfferAmount, setPendingOfferAmount] = useState<number | null>(
    isOffer === '1' && offerAmount ? parseFloat(offerAmount) : null,
  );
  const [offerStatus, setOfferStatus] = useState<'pending' | 'accepted' | 'rejected' | 'countered' | null>(
    isOffer === '1' ? 'pending' : null,
  );
  const [counterModalVisible, setCounterModalVisible] = useState(false);
  const [counterInput, setCounterInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserOnline, setOtherUserOnline] = useState(false);
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set());
  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Socket.io connection
  useEffect(() => {
    let socket: Socket | null = null;

    const connectSocket = async () => {
      const token = await getToken();
      if (!token || !id) return;

      socket = io(`${SOCKET_ORIGIN}/chat`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        socket?.emit('joinConversation', { conversationId: id });
      });

      socket.on('newMessage', (message: Message) => {
        setMessages((prev) => {
          // Avoid duplicates
          if (prev.some((m) => m.id === message.id)) return prev;
          return [message, ...prev];
        });
        // Auto-mark as read if message is from other user
        if (message.senderId !== user?.id) {
          socket?.emit('markRead', { conversationId: id });
        }
      });

      socket.on('typing', (data: { conversationId: string; userId: string }) => {
        if (data.conversationId === id && data.userId !== user?.id) {
          setIsTyping(true);
        }
      });

      socket.on('stopTyping', (data: { conversationId: string; userId: string }) => {
        if (data.conversationId === id && data.userId !== user?.id) {
          setIsTyping(false);
        }
      });

      socket.on('messagesRead', (data: { conversationId: string; readBy: string }) => {
        if (data.conversationId === id && data.readBy !== user?.id) {
          // Mark all sent messages as read
          setMessages((prev) =>
            prev.map((m) =>
              m.senderId === user?.id && !m.readAt
                ? { ...m, readAt: new Date().toISOString() }
                : m,
            ),
          );
          setReadMessageIds((prev) => {
            const next = new Set(prev);
            messages.forEach((m) => {
              if (m.senderId === user?.id) next.add(m.id);
            });
            return next;
          });
        }
      });

      socket.on('userOnline', (data: { userId: string }) => {
        if (data.userId !== user?.id) {
          setOtherUserOnline(true);
        }
      });

      socket.on('userOffline', (data: { userId: string }) => {
        if (data.userId !== user?.id) {
          setOtherUserOnline(false);
        }
      });
    };

    connectSocket();

    return () => {
      if (socket) {
        socket.emit('leaveConversation', { conversationId: id });
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [id, user?.id]);

  const fetchMessages = useCallback(async (pageNum: number) => {
    if (!id) return;
    try {
      const data = await getMessages(id, pageNum);
      if (pageNum === 1) {
        setMessages(data.items);
      } else {
        setMessages((prev) => [...prev, ...data.items]);
      }
      setHasMore(pageNum < data.totalPages);
    } catch (_error) {
      // API unavailable — load demo messages (page 1 only)
      if (pageNum === 1) {
        const demoMsgs = getDemoMessages(id);
        setMessages(demoMsgs);
        setHasMore(false);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMessages(1);
  }, [fetchMessages]);

  // Mark messages as read on initial load
  useEffect(() => {
    if (!loading && messages.length > 0 && socketRef.current) {
      socketRef.current.emit('markRead', { conversationId: id });
    }
  }, [loading, id, messages.length]);

  const handleTextChange = useCallback((value: string) => {
    setText(value);

    // Emit typing indicator
    if (socketRef.current && id) {
      socketRef.current.emit('typing', { conversationId: id });

      // Clear previous timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Stop typing after 2 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit('stopTyping', { conversationId: id });
      }, 2000);
    }
  }, [id]);

  const handleAttachImage = useCallback(async () => {
    if (!id || attaching || sending) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permissão negada', 'Conceda acesso à galeria para anexar imagens.');
        return;
      }
      const pick = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: false,
      });
      if (pick.canceled || !pick.assets?.[0]?.uri) return;
      setAttaching(true);
      const uploaded = await uploadListingImage(pick.assets[0].uri);
      const sent = await sendMessage(id, '📷', uploaded.url);
      setMessages((prev) => [...prev, sent]);
      socketRef.current?.emit('sendMessage', { conversationId: id, body: '📷', imageUrl: uploaded.url });
    } catch (err) {
      Alert.alert('Erro ao enviar imagem', String(err).slice(0, 200));
    } finally {
      setAttaching(false);
    }
  }, [id, attaching, sending]);

  const handleSend = useCallback(async () => {
    if (!text.trim() || !id || sending) return;
    const body = text.trim();
    setText('');
    setSending(true);

    // Stop typing indicator
    if (socketRef.current) {
      socketRef.current.emit('stopTyping', { conversationId: id });
    }

    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      conversationId: id,
      senderId: user?.id ?? '',
      body,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [optimisticMessage, ...prev]);

    try {
      const sent = await sendMessage(id, body);
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticMessage.id ? sent : m)),
      );
    } catch (_error) {
      // API unavailable — keep optimistic message as sent (demo mode)
      const demoSent: Message = { ...optimisticMessage, id: `demo-sent-${Date.now()}` };
      addDemoMessage(id, demoSent);
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticMessage.id ? demoSent : m)),
      );
    } finally {
      setSending(false);
    }
  }, [text, id, sending, user?.id]);

  // --- Offer actions ---
  const handleAcceptOffer = () => {
    if (pendingOfferAmount == null) return;
    Alert.alert(
      'Confirmar aceitação',
      `Tem certeza que deseja aceitar a oferta de R$ ${formatBrl(pendingOfferAmount)}? O comprador receberá um botão de compra com este valor.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aceitar',
          onPress: () => {
            setOfferStatus('accepted');
            const confirmMsg: Message = {
              id: `offer-accepted-${Date.now()}`,
              conversationId: id ?? '',
              senderId: user?.id ?? '',
              body: `✅ Oferta de R$ ${formatBrl(pendingOfferAmount)} aceita! O comprador pode finalizar a compra agora.`,
              readAt: null,
              createdAt: new Date().toISOString(),
            };
            setMessages((prev) => [confirmMsg, ...prev]);
            addDemoMessage(id ?? '', confirmMsg);
          },
        },
      ],
    );
  };

  const handleRejectOffer = () => {
    Alert.alert('Rejeitar oferta', 'Tem certeza que deseja rejeitar esta oferta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Rejeitar',
        style: 'destructive',
        onPress: () => {
          setOfferStatus('rejected');
          const rejectMsg: Message = {
            id: `offer-rejected-${Date.now()}`,
            conversationId: id ?? '',
            senderId: user?.id ?? '',
            body: '❌ Oferta rejeitada.',
            readAt: null,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [rejectMsg, ...prev]);
          addDemoMessage(id ?? '', rejectMsg);
        },
      },
    ]);
  };

  const handleCounterOffer = () => {
    const counter = parseFloat(counterInput.replace(',', '.'));
    if (isNaN(counter) || counter <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor válido para a contraproposta.');
      return;
    }
    setOfferStatus('countered');
    setPendingOfferAmount(counter);
    setCounterModalVisible(false);
    setCounterInput('');
    const counterMsg: Message = {
      id: `offer-counter-${Date.now()}`,
      conversationId: id ?? '',
      senderId: user?.id ?? '',
      body: `🔄 Contraproposta: R$ ${formatBrl(counter)}\n\nO vendedor fez uma contraproposta. Você pode aceitar, rejeitar ou fazer uma nova oferta.`,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [counterMsg, ...prev]);
    addDemoMessage(id ?? '', counterMsg);
  };

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchMessages(nextPage);
  }, [hasMore, loading, page, fetchMessages]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateSeparator = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Hoje';
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  };

  const shouldShowDateSeparator = (index: number) => {
    if (index === messages.length - 1) return true;
    const current = new Date(messages[index].createdAt).toDateString();
    const next = new Date(messages[index + 1].createdAt).toDateString();
    return current !== next;
  };

  const renderReadReceipt = (item: Message) => {
    if (item.senderId !== user?.id) return null;

    const isRead = item.readAt !== null || readMessageIds.has(item.id);

    return (
      <Ionicons
        name={isRead ? 'checkmark-done' : 'checkmark'}
        size={14}
        color={isRead ? '#34D399' : 'rgba(255,255,255,0.5)'}
        style={styles.readReceipt}
      />
    );
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMine = item.senderId === user?.id;
    return (
      <View>
        {shouldShowDateSeparator(index) && (
          <View style={styles.dateSeparator}>
            <Text style={[styles.dateSeparatorText, { backgroundColor: theme.cardSecondary, color: theme.textSecondary }]}>
              {formatDateSeparator(item.createdAt)}
            </Text>
          </View>
        )}
        <View
          style={[
            styles.bubbleRow,
            isMine ? styles.bubbleRowRight : styles.bubbleRowLeft,
          ]}
        >
          <View
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : [styles.bubbleTheirs, { backgroundColor: theme.cardSecondary }],
            ]}
          >
            {item.imageUrl && (
              <Image
                source={{ uri: item.imageUrl }}
                style={styles.bubbleImage}
                resizeMode="cover"
              />
            )}
            <Text
              style={[
                styles.bubbleText,
                isMine ? styles.bubbleTextMine : [styles.bubbleTextTheirs, { color: theme.text }],
              ]}
            >
              {item.body}
            </Text>
            <View style={styles.messageFooter}>
              <Text
                style={[
                  styles.timeText,
                  isMine ? styles.timeTextMine : [styles.timeTextTheirs, { color: theme.textSecondary }],
                ]}
              >
                {formatTime(item.createdAt)}
              </Text>
              {renderReadReceipt(item)}
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: participantName ?? 'Conversa' }} />
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: participantName ?? 'Conversa',
          headerRight: () => (
            <View style={styles.headerRight}>
              <View
                style={[
                  styles.onlineIndicator,
                  otherUserOnline ? styles.online : styles.offline,
                ]}
              />
              <Text style={[styles.statusText, { color: theme.textSecondary }]}>
                {otherUserOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          ),
        }}
      />
      {/* Offer banner — visible when there's a pending/active offer */}
      {pendingOfferAmount != null && (
        <View style={[styles.offerBanner, { backgroundColor: offerStatus === 'accepted' ? colors.success[50] : offerStatus === 'rejected' ? colors.error[50] : theme.cardSecondary, borderBottomColor: theme.border }]}>
          <View style={styles.offerBannerLeft}>
            <Ionicons
              name={offerStatus === 'accepted' ? 'checkmark-circle' : offerStatus === 'rejected' ? 'close-circle' : 'pricetag'}
              size={20}
              color={offerStatus === 'accepted' ? colors.success[600] : offerStatus === 'rejected' ? colors.error[500] : colors.primary[600]}
            />
            <View>
              <Text style={[styles.offerBannerLabel, { color: theme.textSecondary }]}>
                {offerStatus === 'accepted' ? 'Oferta aceita' : offerStatus === 'rejected' ? 'Oferta rejeitada' : offerStatus === 'countered' ? 'Contraproposta' : 'Oferta pendente'}
              </Text>
              <Text style={[styles.offerBannerAmount, { color: theme.text }]}>
                R$ {formatBrl(pendingOfferAmount)}
              </Text>
            </View>
          </View>

          {/* Show actions only for pending/countered offers */}
          {(offerStatus === 'pending' || offerStatus === 'countered') && (
            <View style={styles.offerActions}>
              <TouchableOpacity style={[styles.offerActionBtn, styles.offerRejectBtn]} onPress={handleRejectOffer}>
                <Text style={styles.offerRejectText}>Rejeitar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.offerActionBtn, styles.offerCounterBtn]} onPress={() => setCounterModalVisible(true)}>
                <Text style={styles.offerCounterText}>Contra</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.offerActionBtn, styles.offerAcceptBtn]} onPress={handleAcceptOffer}>
                <Text style={styles.offerAcceptText}>Aceitar</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Buy Now button shown to buyer after seller accepts */}
          {offerStatus === 'accepted' && (
            <TouchableOpacity
              style={styles.buyNowBtn}
              onPress={() => {
                if (!listingId) {
                  Alert.alert('Erro', 'Dados do anúncio não encontrados.');
                  return;
                }
                router.push({
                  pathname: '/checkout',
                  params: {
                    listingId,
                    title: listingTitle ?? 'Oferta aceita',
                    priceBrl: String(pendingOfferAmount ?? 0),
                  },
                });
              }}
            >
              <Text style={styles.buyNowText}>Comprar agora</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        inverted
        contentContainerStyle={styles.messagesList}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={11}
        initialNumToRender={8}
      />
      {isTyping && (
        <View style={[styles.typingContainer, { backgroundColor: theme.background }]}>
          <Text style={[styles.typingText, { color: theme.textSecondary }]}>Digitando...</Text>
        </View>
      )}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: theme.card, borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={handleAttachImage}
          disabled={sending || attaching}
          accessibilityLabel="Anexar imagem"
        >
          <Ionicons
            name={attaching ? 'hourglass-outline' : 'image-outline'}
            size={22}
            color={colors.primary[600]}
          />
        </TouchableOpacity>
        <TextInput
          style={[styles.textInput, { backgroundColor: theme.inputBg, color: theme.text }]}
          value={text}
          onChangeText={handleTextChange}
          placeholder="Escreva uma mensagem..."
          placeholderTextColor={theme.textSecondary}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            !text.trim() && { backgroundColor: theme.cardSecondary },
          ]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          <Ionicons
            name="send"
            size={20}
            color={text.trim() ? '#ffffff' : colors.neutral[400]}
          />
        </TouchableOpacity>
      </View>
      {/* Counter offer modal */}
      <Modal visible={counterModalVisible} transparent animationType="slide">
        <View style={styles.counterOverlay}>
          <View style={[styles.counterModal, { backgroundColor: theme.card }]}>
            <Text style={[styles.counterTitle, { color: theme.text }]}>Fazer contraproposta</Text>
            <Text style={[styles.counterSubtitle, { color: theme.textSecondary }]}>
              Oferta atual: R$ {pendingOfferAmount != null ? formatBrl(pendingOfferAmount) : '—'}
            </Text>
            <View style={styles.counterInputRow}>
              <Text style={[styles.counterPrefix, { color: theme.text }]}>R$</Text>
              <TextInput
                style={[styles.counterInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBg }]}
                placeholder="0,00"
                placeholderTextColor={theme.textTertiary}
                value={counterInput}
                onChangeText={setCounterInput}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>
            <View style={styles.counterButtons}>
              <TouchableOpacity
                style={[styles.counterCancelBtn, { borderColor: theme.border }]}
                onPress={() => { setCounterModalVisible(false); setCounterInput(''); }}
              >
                <Text style={[styles.counterCancelText, { color: theme.textSecondary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.counterConfirmBtn} onPress={handleCounterOffer}>
                <Text style={styles.counterConfirmText}>Enviar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  onlineIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  online: {
    backgroundColor: '#34D399',
  },
  offline: {
    backgroundColor: colors.neutral[400],
  },
  statusText: {
    fontSize: 12,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 12,
  },
  dateSeparatorText: {
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  bubbleRow: {
    marginVertical: 2,
    maxWidth: '80%',
  },
  bubbleRowRight: {
    alignSelf: 'flex-end',
  },
  bubbleRowLeft: {
    alignSelf: 'flex-start',
  },
  bubbleImage: {
    width: 200,
    height: 200,
    borderRadius: 10,
    marginBottom: 6,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  bubbleMine: {
    backgroundColor: colors.primary[500],
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTextMine: {
    color: '#ffffff',
  },
  bubbleTextTheirs: {},
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  timeText: {
    fontSize: 11,
  },
  timeTextMine: {
    color: 'rgba(255,255,255,0.7)',
  },
  timeTextTheirs: {},
  readReceipt: {
    marginLeft: 4,
  },
  typingContainer: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  typingText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  attachButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: colors.primary[500],
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {},
  // Offer banner
  offerBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, flexWrap: 'wrap', gap: 8,
  },
  offerBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  offerBannerLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  offerBannerAmount: { fontSize: 16, fontWeight: '700' },
  offerActions: { flexDirection: 'row', gap: 6 },
  offerActionBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  offerRejectBtn: { backgroundColor: colors.error[50], borderWidth: 1, borderColor: colors.error[200] },
  offerRejectText: { fontSize: 12, fontWeight: '600', color: colors.error[600] },
  offerCounterBtn: { backgroundColor: colors.warning[50], borderWidth: 1, borderColor: colors.warning[200] },
  offerCounterText: { fontSize: 12, fontWeight: '600', color: colors.warning[700] },
  offerAcceptBtn: { backgroundColor: colors.success[500] },
  offerAcceptText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  buyNowBtn: { backgroundColor: colors.primary[600], paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  buyNowText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // Counter modal
  counterOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  counterModal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  counterTitle: { fontSize: 20, fontWeight: '700' },
  counterSubtitle: { fontSize: 14, marginTop: 4, marginBottom: 20 },
  counterInputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  counterPrefix: { fontSize: 20, fontWeight: '600', marginRight: 8 },
  counterInput: { flex: 1, height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, fontSize: 18 },
  counterButtons: { flexDirection: 'row', gap: 12 },
  counterCancelBtn: { flex: 1, height: 50, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  counterCancelText: { fontSize: 15, fontWeight: '500' },
  counterConfirmBtn: { flex: 1, height: 50, borderRadius: 12, backgroundColor: colors.primary[600], justifyContent: 'center', alignItems: 'center' },
  counterConfirmText: { fontSize: 15, color: '#fff', fontWeight: '600' },
});
