import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';

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
  $transaction: jest.fn(),
};

describe('MessagesService', () => {
  let service: MessagesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: mockPrisma },
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
      const sentMessage = { id: 'msg-1', conversationId: 'conv-1', senderId: 'user-1', body: 'Olá' };
      mockPrisma.$transaction.mockResolvedValue([sentMessage, {}]);

      const result = await service.sendMessage('conv-1', 'user-1', 'Olá');

      expect(result).toEqual(sentMessage);
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
});
