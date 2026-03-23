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
import { MessagesService } from './messages.service';

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

  constructor(private readonly messagesService: MessagesService) {}

  handleConnection(client: Socket) {
    const userId =
      (client.handshake.auth?.userId as string | undefined) ||
      (client.handshake.query?.userId as string | undefined);

    if (userId) {
      const existing = this.userSockets.get(userId) || [];
      existing.push(client.id);
      this.userSockets.set(userId, existing);
      client.join(`user:${userId}`);
      this.logger.log(`Client connected: ${client.id} (user: ${userId})`);
    } else {
      this.logger.warn(`Client connected without userId: ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    for (const [userId, socketIds] of this.userSockets.entries()) {
      const filtered = socketIds.filter((id) => id !== client.id);
      if (filtered.length === 0) {
        this.userSockets.delete(userId);
      } else {
        this.userSockets.set(userId, filtered);
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; body: string },
  ) {
    const userId = client.handshake.auth?.userId as string | undefined;
    if (!userId) {
      return { error: 'Not authenticated' };
    }

    try {
      const message = await this.messagesService.sendMessage(
        data.conversationId,
        userId,
        data.body,
      );

      // Emit to all participants in the conversation room
      this.server
        .to(`conversation:${data.conversationId}`)
        .emit('newMessage', message);

      return message;
    } catch (err) {
      this.logger.error(
        `Failed to send message: ${String(err).slice(0, 200)}`,
      );
      return { error: 'Failed to send message' };
    }
  }

  @SubscribeMessage('joinConversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.join(`conversation:${data.conversationId}`);
    this.logger.log(
      `Client ${client.id} joined conversation:${data.conversationId}`,
    );
    return { joined: data.conversationId };
  }

  @SubscribeMessage('leaveConversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conversation:${data.conversationId}`);
    this.logger.log(
      `Client ${client.id} left conversation:${data.conversationId}`,
    );
    return { left: data.conversationId };
  }

  /**
   * Emit an event to a specific user across all their connected sockets.
   */
  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}
