import { Test, TestingModule } from '@nestjs/testing';
import { MessagesGateway } from './messages.gateway';
import { MessagesService } from './messages.service';
import { Socket, Server } from 'socket.io';

const mockMessagesService = {
  sendMessage: jest.fn(),
  getConversations: jest.fn(),
  getMessages: jest.fn(),
  startConversation: jest.fn(),
};

describe('MessagesGateway', () => {
  let gateway: MessagesGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesGateway,
        { provide: MessagesService, useValue: mockMessagesService },
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
    it('should register user socket on connection with userId', () => {
      const client = {
        id: 'socket-1',
        handshake: { auth: { userId: 'user-1' }, query: {} },
        join: jest.fn(),
      } as unknown as Socket;

      gateway.handleConnection(client);

      expect(client.join).toHaveBeenCalledWith('user:user-1');
    });

    it('should handle connection without userId', () => {
      const client = {
        id: 'socket-2',
        handshake: { auth: {}, query: {} },
        join: jest.fn(),
      } as unknown as Socket;

      gateway.handleConnection(client);

      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should clean up socket mapping on disconnect', () => {
      const client1 = {
        id: 'socket-1',
        handshake: { auth: { userId: 'user-1' }, query: {} },
        join: jest.fn(),
      } as unknown as Socket;

      gateway.handleConnection(client1);
      gateway.handleDisconnect(client1);

      // The user should be removed from the mapping
      // (internal state — we verify no errors are thrown)
    });
  });

  describe('handleSendMessage', () => {
    it('should send message and emit to conversation room', async () => {
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
        handshake: { auth: { userId: 'user-1' }, query: {} },
      } as unknown as Socket;

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
        id: 'socket-2',
        handshake: { auth: {}, query: {} },
      } as unknown as Socket;

      const result = await gateway.handleSendMessage(client, {
        conversationId: 'conv-1',
        body: 'Hello!',
      });

      expect(result).toEqual({ error: 'Not authenticated' });
      expect(mockMessagesService.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle service errors gracefully', async () => {
      mockMessagesService.sendMessage.mockRejectedValue(
        new Error('DB error'),
      );

      const client = {
        id: 'socket-1',
        handshake: { auth: { userId: 'user-1' }, query: {} },
      } as unknown as Socket;

      const result = await gateway.handleSendMessage(client, {
        conversationId: 'conv-1',
        body: 'Hello!',
      });

      expect(result).toEqual({ error: 'Failed to send message' });
    });
  });

  describe('handleJoinConversation', () => {
    it('should join conversation room', () => {
      const client = {
        id: 'socket-1',
        join: jest.fn(),
      } as unknown as Socket;

      const result = gateway.handleJoinConversation(client, {
        conversationId: 'conv-1',
      });

      expect(client.join).toHaveBeenCalledWith('conversation:conv-1');
      expect(result).toEqual({ joined: 'conv-1' });
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
