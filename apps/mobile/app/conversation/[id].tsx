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
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useAuth } from '../../src/contexts/AuthContext';
import { getMessages, sendMessage, Message } from '../../src/services/messages';

export default function ConversationScreen() {
  const { id, participantName } = useLocalSearchParams<{
    id: string;
    participantName?: string;
  }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const flatListRef = useRef<FlatList>(null);

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
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMessages(1);
  }, [fetchMessages]);

  const handleSend = useCallback(async () => {
    if (!text.trim() || !id || sending) return;
    const body = text.trim();
    setText('');
    setSending(true);

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
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id));
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

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMine = item.senderId === user?.id;
    return (
      <View>
        {shouldShowDateSeparator(index) && (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateSeparatorText}>
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
              isMine ? styles.bubbleMine : styles.bubbleTheirs,
            ]}
          >
            <Text
              style={[
                styles.bubbleText,
                isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs,
              ]}
            >
              {item.body}
            </Text>
            <Text
              style={[
                styles.timeText,
                isMine ? styles.timeTextMine : styles.timeTextTheirs,
              ]}
            >
              {formatTime(item.createdAt)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: participantName ?? 'Conversa' }} />
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen options={{ title: participantName ?? 'Conversa' }} />
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
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={text}
          onChangeText={setText}
          placeholder="Escreva uma mensagem..."
          placeholderTextColor={colors.neutral[400]}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            !text.trim() && styles.sendButtonDisabled,
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
    backgroundColor: colors.neutral[50],
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral[50],
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
    color: colors.neutral[500],
    backgroundColor: colors.neutral[100],
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
    backgroundColor: colors.neutral[200],
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTextMine: {
    color: '#ffffff',
  },
  bubbleTextTheirs: {
    color: colors.neutral[900],
  },
  timeText: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timeTextMine: {
    color: 'rgba(255,255,255,0.7)',
  },
  timeTextTheirs: {
    color: colors.neutral[500],
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.neutral[100],
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: colors.neutral[900],
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
  sendButtonDisabled: {
    backgroundColor: colors.neutral[200],
  },
});
