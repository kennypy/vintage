import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';

export interface Message {
  id: string;
  senderId: string;
  content: string;
  createdAt: Date;
  isRead: boolean;
}

export function useMessages(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { authToken } = useAuth();

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        setIsLoading(true);
        const res = await axios.get(
          `/api/v1/messages/${conversationId}`,
          { headers: { Authorization: `Bearer ${authToken}` } },
        );
        setMessages(res.data);
      } catch (error) {
        console.error('Failed to fetch messages:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [conversationId, authToken]);

  const sendMessage = useCallback(async (content: string) => {
    try {
      const res = await axios.post(
        '/api/v1/messages',
        { conversationId, content },
        { headers: { Authorization: `Bearer ${authToken}` } },
      );
      setMessages(prev => [...prev, res.data]);
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }, [conversationId, authToken]);

  const markAsRead = useCallback(async (messageIds: string[]) => {
    try {
      await axios.patch(
        `/api/v1/messages/mark-read`,
        { messageIds },
        { headers: { Authorization: `Bearer ${authToken}` } },
      );
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }
  }, [authToken]);

  return { messages, isLoading, sendMessage, markAsRead };
}
