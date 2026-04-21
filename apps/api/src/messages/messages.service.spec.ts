import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const mockNotifications = {
  createNotification: jest.fn().mockResolvedValue(null),
};

const mockPrisma = {
  conversation: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  message: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  user: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  userBlock: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  $transaction: jest.fn(),
};

describe('MessagesService', () => {
  let service: MessagesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.userBlock.findMany.mockResolvedValue([]);
    mockPrisma.userBlock.findFirst.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
  });

  describe('getConversations', () => {
    it('should return conversations with other user info', async () => {
      const conversations = [
        {
          id: 'conv-1',
          participant1Id: 'user-1',
          participant2Id: 'user-2',
          participant1: { id: 'user-1', name: 'Alice', avatarUrl: null },
          participant2: { id: 'user-2', name: 'Bob', avatarUrl: null },
          messages: [{ id: 'msg-1', body: 'Olá' }],
          lastMessageAt: new Date(),
          orderId: null,
        },
      ];
      mockPrisma.conversation.findMany.mockResolvedValue(conversations);

      const result = await service.getConversations('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].otherUser.id).toBe('user-2');
      expect(result[0].lastMessage).toEqual({ id: 'msg-1', body: 'Olá' });
    });

    it('should return empty array when no conversations', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);

      const result = await service.getConversations('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('getMessages', () => {
    const mockConversation = {
      id: 'conv-1',
      participant1Id: 'user-1',
      participant2Id: 'user-2',
    };

    it('should return paginated messages and mark as read', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
      const messages = [
        { id: 'msg-1', body: 'Olá', senderId: 'user-2' },
        { id: 'msg-2', body: 'Tudo bem?', senderId: 'user-1' },
      ];
      mockPrisma.message.findMany.mockResolvedValue(messages);
      mockPrisma.message.count.mockResolvedValue(2);
      mockPrisma.message.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.getMessages('conv-1', 'user-1');

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
      expect(mockPrisma.message.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: 'conv-1', senderId: { not: 'user-1' }, readAt: null },
        }),
      );
    });

    it('should throw NotFoundException if conversation not found', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.getMessages('nonexistent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getMessages('nonexistent', 'user-1')).rejects.toThrow(
        'Conversa não encontrada',
      );
    });

    it('should throw ForbiddenException if user is not a participant', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);

      await expect(service.getMessages('conv-1', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.getMessages('conv-1', 'other-user')).rejects.toThrow(
        'Acesso negado',
      );
    });
  });

  describe('sendMessage', () => {
    const mockConversation = {
      id: 'conv-1',
      participant1Id: 'user-1',
      participant2Id: 'user-2',
    };

    it('should send a message and update lastMessageAt', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
      // Include the sender relation because sendMessage now reads
      // message.sender.name to compose the notification title.
      const sentMessage = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        body: 'Olá',
        sender: { id: 'user-1', name: 'Maria', avatarUrl: null },
      };
      mockPrisma.$transaction.mockResolvedValue([sentMessage, {}]);

      const result = await service.sendMessage('conv-1', 'user-1', 'Olá');

      expect(result).toEqual(sentMessage);
      // Recipient (participant2 here) gets a "messages"-category notif.
      expect(mockNotifications.createNotification).toHaveBeenCalledWith(
        'user-2',
        'NEW_MESSAGE',
        expect.stringContaining('mensagem'),
        'Olá',
        expect.objectContaining({ conversationId: 'conv-1', senderId: 'user-1' }),
        'messages',
      );
    });

    it('should throw NotFoundException if conversation not found', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.sendMessage('nonexistent', 'user-1', 'Olá')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.sendMessage('nonexistent', 'user-1', 'Olá')).rejects.toThrow(
        'Conversa não encontrada',
      );
    });

    it('should throw ForbiddenException if user is not a participant', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);

      await expect(service.sendMessage('conv-1', 'other-user', 'Olá')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.sendMessage('conv-1', 'other-user', 'Olá')).rejects.toThrow(
        'Acesso negado',
      );
    });
  });

  describe('startConversation', () => {
    it('should prevent self-conversation', async () => {
      await expect(service.startConversation('user-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.startConversation('user-1', 'user-1')).rejects.toThrow(
        'Não é possível iniciar conversa consigo mesmo',
      );
    });

    it('should return existing conversation if one exists', async () => {
      const existing = { id: 'conv-1', participant1Id: 'user-1', participant2Id: 'user-2' };
      mockPrisma.conversation.findFirst.mockResolvedValue(existing);

      const result = await service.startConversation('user-1', 'user-2');

      expect(result).toEqual(existing);
      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
    });

    it('should create a new conversation if none exists', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      const newConversation = { id: 'conv-1', participant1Id: 'user-1', participant2Id: 'user-2' };
      mockPrisma.conversation.create.mockResolvedValue(newConversation);

      const result = await service.startConversation('user-1', 'user-2');

      expect(result).toEqual(newConversation);
      expect(mockPrisma.conversation.create).toHaveBeenCalled();
    });
  });

  describe('getUnreadCount', () => {
    it('should return total unread message count', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        { id: 'conv-1' },
        { id: 'conv-2' },
      ]);
      mockPrisma.message.count.mockResolvedValue(5);

      const result = await service.getUnreadCount('user-1');

      expect(result).toBe(5);
      expect(mockPrisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: { in: ['conv-1', 'conv-2'] },
          senderId: { not: 'user-1' },
          readAt: null,
        },
      });
    });

    it('should return 0 when user has no conversations', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);

      const result = await service.getUnreadCount('user-1');

      expect(result).toBe(0);
    });
  });

  describe('markConversationRead', () => {
    const mockConversation = {
      id: 'conv-1',
      participant1Id: 'user-1',
      participant2Id: 'user-2',
    };

    it('should mark unread messages as read and return count', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);
      mockPrisma.message.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markConversationRead('conv-1', 'user-1');

      expect(result).toBe(3);
      expect(mockPrisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          conversationId: 'conv-1',
          senderId: { not: 'user-1' },
          readAt: null,
        },
        data: { readAt: expect.any(Date) },
      });
    });

    it('should throw NotFoundException if conversation not found', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.markConversationRead('nonexistent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user is not a participant', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);

      await expect(service.markConversationRead('conv-1', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
