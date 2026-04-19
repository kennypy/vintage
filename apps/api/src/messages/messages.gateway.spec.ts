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
  user: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'user-1',
      isBanned: false,
      deletedAt: null,
      tokenVersion: 0,
    }),
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

    // Re-seed defaults after clearAllMocks. user.findUnique is hit on
    // every accepted connection (tokenVersion + delete/ban check);
    // conversation.findUnique is hit by the participant check in
    // typing/stopTyping.
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isBanned: false,
      deletedAt: null,
      tokenVersion: 0,
    });
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      participant1Id: 'user-1',
      participant2Id: 'user-2',
    });
  });

  describe('handleConnection', () => {
    it('should accept connection with valid JWT', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', ver: 0 });

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
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', ver: 0 });

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
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', ver: 0 });

      const client = {
        id: 'socket-1',
        handshake: { auth: { token: 'valid-jwt' }, query: {}, headers: {} },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
        to: jest.fn().mockReturnThis(),
      } as unknown as Socket;

      await gateway.handleConnection(client);

      const result = await gateway.handleTyping(client, { conversationId: 'conv-1' });

      expect(client.to).toHaveBeenCalledWith('conversation:conv-1');
      expect((client.to as jest.Mock).mock.results[0].value.emit).toHaveBeenCalledWith('typing', {
        conversationId: 'conv-1',
        userId: 'user-1',
      });
      expect(result).toEqual({ ok: true });
    });

    it('should return error when not authenticated', async () => {
      const client = {
        id: 'unknown-socket',
        to: jest.fn().mockReturnThis(),
      } as unknown as Socket;

      const result = await gateway.handleTyping(client, { conversationId: 'conv-1' });

      expect(result).toEqual({ error: 'Não autenticado' });
    });
  });

  describe('handleMarkRead', () => {
    it('should mark messages as read and notify room', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', ver: 0 });
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
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', ver: 0 });

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
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', ver: 0 });

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
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', ver: 0 });
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
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', ver: 0 });
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
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', ver: 0 });
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
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', ver: 0 });
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
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', ver: 0 });
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

  describe('WS hardening (adversarial audit)', () => {
    const makeClient = (id = 'socket-hardening') =>
      ({
        id,
        handshake: { auth: { token: 'valid-jwt' }, query: {}, headers: {} },
        join: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
        to: jest.fn().mockReturnThis(),
      }) as unknown as Socket;

    it('refuses twofa_pending tokens — second factor must land before WS auth', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'user-1',
        ver: 0,
        type: 'twofa_pending',
      });
      const client = makeClient();
      await gateway.handleConnection(client);
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Token inválido' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('refuses tokens with a stale tokenVersion (password change / forced logout)', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', ver: 0 });
      // DB has moved on.
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        isBanned: false,
        deletedAt: null,
        tokenVersion: 3,
      });
      const client = makeClient();
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Sessão expirada — faça login novamente.',
      });
    });

    it('refuses banned / soft-deleted users even with a valid JWT', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', ver: 0 });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        isBanned: true,
        deletedAt: null,
        tokenVersion: 0,
      });
      const client = makeClient();
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('caps concurrent sockets per user at 10', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', ver: 0 });

      // Open 10 sockets — all should succeed.
      for (let i = 0; i < 10; i++) {
        const c = makeClient(`sock-${i}`);
        await gateway.handleConnection(c);
        expect(c.disconnect).not.toHaveBeenCalled();
      }
      // The 11th is refused.
      const eleventh = makeClient('sock-11');
      await gateway.handleConnection(eleventh);
      expect(eleventh.disconnect).toHaveBeenCalledWith(true);
      expect(eleventh.emit).toHaveBeenCalledWith('error', {
        message: 'Muitas conexões abertas.',
      });
    });

    it('typing refuses non-participants — no cross-conversation broadcast', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', ver: 0 });
      const client = makeClient();
      await gateway.handleConnection(client);
      // Attacker emits typing for a conversation they're not in.
      mockPrisma.conversation.findUnique.mockResolvedValueOnce({
        id: 'conv-private',
        participant1Id: 'victim',
        participant2Id: 'other-victim',
      });
      const result = await gateway.handleTyping(client, { conversationId: 'conv-private' });
      expect(result).toEqual({ error: 'Acesso negado' });
      // Critical: no emit into the victim's room.
      expect(client.to).not.toHaveBeenCalled();
    });

    it('rate-limits sendMessage past 30/minute per socket', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', ver: 0 });
      mockMessagesService.sendMessage.mockResolvedValue({ id: 'm' });
      const client = makeClient();
      await gateway.handleConnection(client);

      // First 30 calls succeed.
      for (let i = 0; i < 30; i++) {
        const r = await gateway.handleSendMessage(client, {
          conversationId: 'conv-1',
          body: `msg-${i}`,
        });
        expect(r).toEqual({ id: 'm' });
      }
      // 31st gets throttled before the service is touched.
      const over = await gateway.handleSendMessage(client, {
        conversationId: 'conv-1',
        body: 'flood',
      });
      expect(over).toEqual({
        error: 'Você está enviando mensagens muito rápido. Aguarde um pouco.',
      });
      // Service wasn't called for the 31st.
      expect(mockMessagesService.sendMessage).toHaveBeenCalledTimes(30);
    });

    it('rejects malformed sendMessage payloads before any service call', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', ver: 0 });
      const client = makeClient();
      await gateway.handleConnection(client);

      const tooLong = 'x'.repeat(5000);
      const r1 = await gateway.handleSendMessage(client, {
        conversationId: 'conv-1',
        body: tooLong,
      });
      expect(r1).toEqual({
        error: expect.stringMatching(/muito longa/i),
      });
      const r2 = await gateway.handleSendMessage(
        client,
        // @ts-expect-error — intentionally malformed payload
        { conversationId: 123, body: 'hi' },
      );
      expect(r2).toEqual({ error: 'Payload inválido' });
      expect(mockMessagesService.sendMessage).not.toHaveBeenCalled();
    });
  });
});
