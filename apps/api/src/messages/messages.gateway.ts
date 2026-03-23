import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MessagesService } from './messages.service';

/** Strip HTML tags from a string to prevent XSS in broadcast messages. */
function sanitizeHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:8081'],
    credentials: true,
  },
  namespace: '/chat',
})
export class MessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger('MessagesGateway');
  private userSockets = new Map<string, string[]>(); // userId -> socketIds
  private socketToUser = new Map<string, string>(); // socketId -> userId
  private userConversations = new Map<string, Set<string>>(); // userId -> conversationIds

  constructor(
    private readonly messagesService: MessagesService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket) {
    // Verify JWT from handshake auth
    const token =
      (client.handshake.auth?.token as string | undefined) ||
      (client.handshake.headers?.authorization?.replace('Bearer ', '') as string | undefined);

    if (!token) {
      this.logger.warn(`Conexão recusada: JWT ausente (socket: ${client.id})`);
      client.emit('error', { message: 'Autenticação necessária' });
      client.disconnect(true);
      return;
    }

    let userId: string;
    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      userId = payload.sub;
    } catch (_err) {
      this.logger.warn(`Conexão recusada: JWT inválido (socket: ${client.id})`);
      client.emit('error', { message: 'Token inválido' });
      client.disconnect(true);
      return;
    }

    // Track socket <-> user mapping
    const existing = this.userSockets.get(userId) || [];
    existing.push(client.id);
    this.userSockets.set(userId, existing);
    this.socketToUser.set(client.id, userId);
    client.join(`user:${userId}`);

    // Re-join previously tracked conversation rooms on reconnect
    const previousConversations = this.userConversations.get(userId);
    if (previousConversations) {
      for (const convId of previousConversations) {
        client.join(`conversation:${convId}`);
      }
    }

    // Broadcast online status (never expose socket IDs)
    this.server.emit('userOnline', { userId });

    this.logger.log(`Cliente conectado: ${client.id} (usuário: ${userId})`);
  }

  handleDisconnect(client: Socket) {
    const userId = this.socketToUser.get(client.id);
    this.socketToUser.delete(client.id);

    if (userId) {
      const socketIds = this.userSockets.get(userId) || [];
      const filtered = socketIds.filter((id) => id !== client.id);
      if (filtered.length === 0) {
        this.userSockets.delete(userId);
        // User is fully offline
        this.server.emit('userOffline', { userId });
      } else {
        this.userSockets.set(userId, filtered);
      }
    }

    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; body: string },
  ) {
    const userId = this.socketToUser.get(client.id);
    if (!userId) {
      return { error: 'Não autenticado' };
    }

    try {
      const sanitizedBody = sanitizeHtml(data.body);
      const message = await this.messagesService.sendMessage(
        data.conversationId,
        userId,
        sanitizedBody,
      );

      // Emit to all participants in the conversation room
      this.server
        .to(`conversation:${data.conversationId}`)
        .emit('newMessage', message);

      return message;
    } catch (err) {
      this.logger.error(
        `Falha ao enviar mensagem: ${String(err).slice(0, 200)}`,
      );
      return { error: 'Falha ao enviar mensagem' };
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.socketToUser.get(client.id);
    if (!userId) {
      return { error: 'Não autenticado' };
    }

    // Emit typing indicator to other participants in the conversation
    client.to(`conversation:${data.conversationId}`).emit('typing', {
      conversationId: data.conversationId,
      userId,
    });

    return { ok: true };
  }

  @SubscribeMessage('stopTyping')
  handleStopTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.socketToUser.get(client.id);
    if (!userId) {
      return { error: 'Não autenticado' };
    }

    client.to(`conversation:${data.conversationId}`).emit('stopTyping', {
      conversationId: data.conversationId,
      userId,
    });

    return { ok: true };
  }

  @SubscribeMessage('markRead')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.socketToUser.get(client.id);
    if (!userId) {
      return { error: 'Não autenticado' };
    }

    try {
      const count = await this.messagesService.markConversationRead(
        data.conversationId,
        userId,
      );

      // Notify other participants that messages were read
      client.to(`conversation:${data.conversationId}`).emit('messagesRead', {
        conversationId: data.conversationId,
        readBy: userId,
        readAt: new Date().toISOString(),
      });

      return { markedRead: count };
    } catch (err) {
      this.logger.error(
        `Falha ao marcar como lido: ${String(err).slice(0, 200)}`,
      );
      return { error: 'Falha ao marcar mensagens como lidas' };
    }
  }

  @SubscribeMessage('joinConversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.socketToUser.get(client.id);
    client.join(`conversation:${data.conversationId}`);

    // Track conversation for reconnection
    if (userId) {
      const convSet = this.userConversations.get(userId) || new Set();
      convSet.add(data.conversationId);
      this.userConversations.set(userId, convSet);
    }

    this.logger.log(
      `Cliente ${client.id} entrou na conversa:${data.conversationId}`,
    );
    return { joined: data.conversationId };
  }

  @SubscribeMessage('leaveConversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.socketToUser.get(client.id);
    client.leave(`conversation:${data.conversationId}`);

    // Remove from tracked conversations
    if (userId) {
      const convSet = this.userConversations.get(userId);
      if (convSet) {
        convSet.delete(data.conversationId);
        if (convSet.size === 0) {
          this.userConversations.delete(userId);
        }
      }
    }

    this.logger.log(
      `Cliente ${client.id} saiu da conversa:${data.conversationId}`,
    );
    return { left: data.conversationId };
  }

  /**
   * Check if a user is currently online.
   */
  isUserOnline(userId: string): boolean {
    return (this.userSockets.get(userId)?.length ?? 0) > 0;
  }

  /**
   * Emit an event to a specific user across all their connected sockets.
   */
  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
