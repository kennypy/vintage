import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { MessagesGateway } from './messages.gateway';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { Socket, Server } from 'socket.io';

const mockMessagesService = {
  sendMessage: jest.fn(),
  getConversations: jest.fn(),
  getMessages: jest.fn(),
  startConversation: jest.fn(),
  getUnreadCount: jest.fn(),
  markConversationRead: jest.fn(),
};

const mockJwtService = {
  verify: jest.fn(),
};

const mockPrisma = {
  conversation: {
    findUnique: jest.fn(),
  },
};

describe('MessagesGateway', () => {
  let gateway: MessagesGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesGateway,
        { provide: MessagesService, useValue: mockMessagesService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    gateway = module.get<MessagesGateway>(MessagesGateway);

    // Mock the server
    gateway.server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    } as unknown as Server;

    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('should accept connection with valid JWT', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });

      const client = {
        id: 'socket-1',
        handshake: { auth: { token: 'valid-jwt' }, query: {}, headers: {} },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(client);

      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-jwt');
      expect(client.join).toHaveBeenCalledWith('user:user-1');
      expect(client.disconnect).not.toHaveBeenCalled();
      expect(gateway.server.emit).toHaveBeenCalledWith('userOnline', { userId: 'user-1' });
    });

    it('should disconnect client without JWT', async () => {
      const client = {
        id: 'socket-2',
        handshake: { auth: {}, query: {}, headers: {} },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(client);

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Autenticação necessária' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('should disconnect client with invalid JWT', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      const client = {
        id: 'socket-3',
        handshake: { auth: { token: 'bad-token' }, query: {}, headers: {} },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(client);

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Token inválido' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleDisconnect', () => {
    it('should emit userOffline when last socket disconnects', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });

      const client = {
        id: 'socket-1',
        handshake: { auth: { token: 'valid-jwt' }, query: {}, headers: {} },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(client);
      jest.clearAllMocks();

      // Re-mock server after clearAllMocks
      gateway.server = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      } as unknown as Server;

      gateway.handleDisconnect(client);

      expect(gateway.server.emit).toHaveBeenCalledWith('userOffline', { userId: 'user-1' });
    });
  });

  describe('handleTyping', () => {
    it('should emit typing event to conversation room', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });

      const client = {
        id: 'socket-1',
        handshake: { auth: { token: 'valid-jwt' }, query: {}, headers: {} },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
        to: jest.fn().mockReturnThis(),
      } as unknown as Socket;

      await gateway.handleConnection(client);

      const result = gateway.handleTyping(client, { conversationId: 'conv-1' });

      expect(client.to).toHaveBeenCalledWith('conversation:conv-1');
      expect((client.to as jest.Mock).mock.results[0].value.emit).toHaveBeenCalledWith('typing', {
        conversationId: 'conv-1',
        userId: 'user-1',
      });
      expect(result).toEqual({ ok: true });
    });

    it('should return error when not authenticated', () => {
      const client = {
        id: 'unknown-socket',
        to: jest.fn().mockReturnThis(),
      } as unknown as Socket;

      const result = gateway.handleTyping(client, { conversationId: 'conv-1' });

      expect(result).toEqual({ error: 'Não autenticado' });
    });
  });

  describe('handleMarkRead', () => {
    it('should mark messages as read and notify room', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockMessagesService.markConversationRead.mockResolvedValue(3);

      const client = {
        id: 'socket-1',
        handshake: { auth: { token: 'valid-jwt' }, query: {}, headers: {} },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
        to: jest.fn().mockReturnThis(),
      } as unknown as Socket;

      await gateway.handleConnection(client);

      const result = await gateway.handleMarkRead(client, { conversationId: 'conv-1' });

      expect(mockMessagesService.markConversationRead).toHaveBeenCalledWith('conv-1', 'user-1');
      expect(result).toEqual({ markedRead: 3 });
      expect(client.to).toHaveBeenCalledWith('conversation:conv-1');
    });
  });

  describe('online status tracking', () => {
    it('should track user as online after connection', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });

      const client = {
        id: 'socket-1',
        handshake: { auth: { token: 'valid-jwt' }, query: {}, headers: {} },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(client);

      expect(gateway.isUserOnline('user-1')).toBe(true);
      expect(gateway.isUserOnline('user-999')).toBe(false);
    });

    it('should track user as offline after all sockets disconnect', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });

      const client = {
        id: 'socket-1',
        handshake: { auth: { token: 'valid-jwt' }, query: {}, headers: {} },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(client);
      gateway.handleDisconnect(client);

      expect(gateway.isUserOnline('user-1')).toBe(false);
    });
  });

  describe('handleSendMessage', () => {
    it('should send message and emit to conversation room', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      const mockMessage = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        body: 'Hello!',
        createdAt: new Date(),
      };
      mockMessagesService.sendMessage.mockResolvedValue(mockMessage);

      const client = {
        id: 'socket-1',
        handshake: { auth: { token: 'valid-jwt' }, query: {}, headers: {} },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(client);

      const result = await gateway.handleSendMessage(client, {
        conversationId: 'conv-1',
        body: 'Hello!',
      });

      expect(mockMessagesService.sendMessage).toHaveBeenCalledWith(
        'conv-1',
        'user-1',
        'Hello!',
      );
      expect(gateway.server.to).toHaveBeenCalledWith('conversation:conv-1');
      expect(result).toEqual(mockMessage);
    });

    it('should return error when not authenticated', async () => {
      const client = {
        id: 'unknown-socket',
        handshake: { auth: {}, query: {}, headers: {} },
      } as unknown as Socket;

      const result = await gateway.handleSendMessage(client, {
        conversationId: 'conv-1',
        body: 'Hello!',
      });

      expect(result).toEqual({ error: 'Não autenticado' });
      expect(mockMessagesService.sendMessage).not.toHaveBeenCalled();
    });

    it('should sanitize HTML from message body', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockMessagesService.sendMessage.mockResolvedValue({ id: 'msg-1' });

      const client = {
        id: 'socket-1',
        handshake: { auth: { token: 'valid-jwt' }, query: {}, headers: {} },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(client);

      await gateway.handleSendMessage(client, {
        conversationId: 'conv-1',
        body: '<script>alert("xss")</script>Hello',
      });

      expect(mockMessagesService.sendMessage).toHaveBeenCalledWith(
        'conv-1',
        'user-1',
        'alert("xss")Hello',
      );
    });

    it('should handle service errors gracefully', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockMessagesService.sendMessage.mockRejectedValue(
        new Error('DB error'),
      );

      const client = {
        id: 'socket-1',
        handshake: { auth: { token: 'valid-jwt' }, query: {}, headers: {} },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(client);

      const result = await gateway.handleSendMessage(client, {
        conversationId: 'conv-1',
        body: 'Hello!',
      });

      expect(result).toEqual({ error: 'Falha ao enviar mensagem' });
    });
  });

  describe('handleJoinConversation', () => {
    it('should join conversation room when user is a participant', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        participant1Id: 'user-1',
        participant2Id: 'user-2',
      });

      const client = {
        id: 'socket-1',
        handshake: { auth: { token: 'valid-jwt' }, query: {}, headers: {} },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(client);
      jest.clearAllMocks();
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        participant1Id: 'user-1',
        participant2Id: 'user-2',
      });

      const result = await gateway.handleJoinConversation(client, {
        conversationId: 'conv-1',
      });

      expect(client.join).toHaveBeenCalledWith('conversation:conv-1');
      expect(result).toEqual({ joined: 'conv-1' });
    });

    it('should reject join when user is not a participant', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        participant1Id: 'user-3',
        participant2Id: 'user-4',
      });

      const client = {
        id: 'socket-1',
        handshake: { auth: { token: 'valid-jwt' }, query: {}, headers: {} },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(client);

      const result = await gateway.handleJoinConversation(client, {
        conversationId: 'conv-1',
      });

      expect(result).toEqual({ error: 'Acesso negado' });
    });

    it('should return error when not authenticated', async () => {
      const client = {
        id: 'unknown-socket',
        join: jest.fn(),
      } as unknown as Socket;

      const result = await gateway.handleJoinConversation(client, {
        conversationId: 'conv-1',
      });

      expect(result).toEqual({ error: 'Não autenticado' });
    });
  });

  describe('handleLeaveConversation', () => {
    it('should leave conversation room', () => {
      const client = {
        id: 'socket-1',
        leave: jest.fn(),
      } as unknown as Socket;

      const result = gateway.handleLeaveConversation(client, {
        conversationId: 'conv-1',
      });

      expect(client.leave).toHaveBeenCalledWith('conversation:conv-1');
      expect(result).toEqual({ left: 'conv-1' });
    });
  });

  describe('emitToUser', () => {
    it('should emit event to user room', () => {
      gateway.emitToUser('user-1', 'notification', { text: 'Hello' });

      expect(gateway.server.to).toHaveBeenCalledWith('user:user-1');
    });
  });
});
