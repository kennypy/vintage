import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { io, Socket } from 'socket.io-client';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { getToken } from '../../src/services/api';
import { getMessages, sendMessage, Message } from '../../src/services/messages';
import { getDemoMessages, addDemoMessage } from '../../src/services/demoStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function ConversationScreen() {
  const { id, participantName } = useLocalSearchParams<{
    id: string;
    participantName?: string;
  }>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
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

      socket = io(`${API_BASE_URL}/chat`, {
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
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        inverted
        contentContainerStyle={styles.messagesList}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
      />
      {isTyping && (
        <View style={[styles.typingContainer, { backgroundColor: theme.background }]}>
          <Text style={[styles.typingText, { color: theme.textSecondary }]}>Digitando...</Text>
        </View>
      )}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: theme.card, borderTopColor: theme.border }]}>
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
});
