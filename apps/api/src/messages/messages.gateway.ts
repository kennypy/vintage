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
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from './messages.service';

/** Strip HTML tags from a string to prevent XSS in broadcast messages. */
function sanitizeHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

/** Max body length accepted at the gateway layer. The HTTP path uses
 *  class-validator to enforce the same bound; the WS path has no
 *  ValidationPipe, so we bound it explicitly. */
const MAX_MESSAGE_BODY_CHARS = 4000;

/** Per-user socket rate limits. These catch scripted spam on top of
 *  whatever the client legitimately sends. Reset every minute; the
 *  counter is per-socket-connection, so multiple tabs get independent
 *  buckets — acceptable since each tab has its own UI tempo. */
const SEND_MESSAGE_LIMIT_PER_MIN = 30;
const TYPING_LIMIT_PER_MIN = 120;
const RATE_WINDOW_MS = 60_000;

/** Max concurrent sockets per user id. Pre-fix, one compromised
 *  access token could open thousands of sockets and each held its
 *  own entry in userSockets / socketToUser / userConversations
 *  — a straightforward memory-exhaustion DoS. 10 is generous for
 *  an individual user (web + mobile + a spare tab) and a hard
 *  ceiling for anything scripted. */
const MAX_SOCKETS_PER_USER = 10;

/**
 * Parse allowed CORS origins from environment variables. Accepts both
 * CORS_ORIGIN (singular, the primary API var — see main.ts) and
 * CORS_ORIGINS (plural, historical gateway-only var). WEB_URL is a
 * last-resort single-origin fallback. Production with none of these
 * set returns [] → Socket.IO rejects every origin. Same fail-closed
 * posture as the REST CORS config.
 */
function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN || process.env.CORS_ORIGINS;
  if (raw) {
    return raw.split(',').map((o) => o.trim()).filter(Boolean);
  }
  if (process.env.WEB_URL) {
    return [process.env.WEB_URL];
  }
  if (process.env.NODE_ENV === 'production') {
    return [];
  }
  return ['http://localhost:3000', 'http://localhost:8081'];
}

@WebSocketGateway({
  cors: {
    origin: parseCorsOrigins(),
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
  // Per-socket rate-limit state. Entry shape: { count, resetAt }.
  // Kept tiny (two counters per socket); pruned on disconnect.
  private rateLimits = new Map<
    string,
    { send: { count: number; resetAt: number }; typing: { count: number; resetAt: number } }
  >();

  constructor(
    private readonly messagesService: MessagesService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
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

    let payload: { sub: string; ver?: number; type?: string };
    try {
      payload = this.jwtService.verify<{ sub: string; ver?: number; type?: string }>(token);
    } catch (_err) {
      this.logger.warn(`Conexão recusada: JWT inválido (socket: ${client.id})`);
      client.emit('error', { message: 'Token inválido' });
      client.disconnect(true);
      return;
    }

    // Access tokens have no `type` claim (refresh tokens are opaque
    // strings since P-07 and don't parse as JWTs). `twofa_pending`
    // tokens DO parse as JWTs with `type: 'twofa_pending'` — they
    // MUST NOT authenticate a WS session, since the second factor
    // hasn't landed yet.
    if (payload.type) {
      this.logger.warn(
        `Conexão recusada: token com type='${payload.type}' não é access token (socket: ${client.id})`,
      );
      client.emit('error', { message: 'Token inválido' });
      client.disconnect(true);
      return;
    }

    const userId = payload.sub;

    // Re-verify user state (deletedAt, isBanned, tokenVersion) against
    // the DB. JwtStrategy does this for every HTTP request; the WS
    // gateway was trusting the JWT signature alone, so a user who'd
    // been banned (or whose tokenVersion bumped via password change /
    // refresh-reuse detection) kept their WS connection alive until
    // the JWT exp fired. Re-running the check on connect (and
    // periodically — future work) closes that window.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isBanned: true, deletedAt: true, tokenVersion: true },
    });
    if (!user || user.deletedAt || user.isBanned) {
      this.logger.warn(
        `Conexão recusada: conta desativada/banida (usuário: ${userId}, socket: ${client.id})`,
      );
      client.emit('error', { message: 'Conta indisponível' });
      client.disconnect(true);
      return;
    }
    if (typeof payload.ver !== 'number' || payload.ver !== user.tokenVersion) {
      this.logger.warn(
        `Conexão recusada: tokenVersion stale (usuário: ${userId}, socket: ${client.id})`,
      );
      client.emit('error', { message: 'Sessão expirada — faça login novamente.' });
      client.disconnect(true);
      return;
    }

    // Per-user connection cap to prevent memory-exhaustion DoS via
    // thousands of concurrent sockets with the same valid token.
    const existing = this.userSockets.get(userId) || [];
    if (existing.length >= MAX_SOCKETS_PER_USER) {
      this.logger.warn(
        `Conexão recusada: limite de ${MAX_SOCKETS_PER_USER} sockets por usuário (usuário: ${userId})`,
      );
      client.emit('error', { message: 'Muitas conexões abertas.' });
      client.disconnect(true);
      return;
    }

    // Track socket <-> user mapping
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
    this.rateLimits.delete(client.id);

    if (userId) {
      const socketIds = this.userSockets.get(userId) || [];
      const filtered = socketIds.filter((id) => id !== client.id);
      if (filtered.length === 0) {
        this.userSockets.delete(userId);
        // Clean up tracked conversations to prevent memory leak
        this.userConversations.delete(userId);
        // User is fully offline
        this.server.emit('userOffline', { userId });
      } else {
        this.userSockets.set(userId, filtered);
      }
    }

    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  /**
   * Check + tick the per-socket rate limit bucket. Returns true when
   * the caller is UNDER the limit for the given bucket; false when
   * they've exhausted their quota for the current 60s window.
   */
  private checkRate(socketId: string, bucket: 'send' | 'typing'): boolean {
    const now = Date.now();
    const state = this.rateLimits.get(socketId) ?? {
      send: { count: 0, resetAt: now + RATE_WINDOW_MS },
      typing: { count: 0, resetAt: now + RATE_WINDOW_MS },
    };
    const slot = state[bucket];
    if (slot.resetAt <= now) {
      slot.count = 0;
      slot.resetAt = now + RATE_WINDOW_MS;
    }
    const ceiling =
      bucket === 'send' ? SEND_MESSAGE_LIMIT_PER_MIN : TYPING_LIMIT_PER_MIN;
    if (slot.count >= ceiling) {
      return false;
    }
    slot.count += 1;
    this.rateLimits.set(socketId, state);
    return true;
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

    // Payload-shape guards — no ValidationPipe on the WS path.
    if (
      !data ||
      typeof data.conversationId !== 'string' ||
      typeof data.body !== 'string' ||
      data.conversationId.length === 0 ||
      data.conversationId.length > 128 ||
      data.body.length === 0
    ) {
      return { error: 'Payload inválido' };
    }
    if (data.body.length > MAX_MESSAGE_BODY_CHARS) {
      return {
        error: `Mensagem muito longa (limite ${MAX_MESSAGE_BODY_CHARS} caracteres).`,
      };
    }

    if (!this.checkRate(client.id, 'send')) {
      return { error: 'Você está enviando mensagens muito rápido. Aguarde um pouco.' };
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
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.socketToUser.get(client.id);
    if (!userId) {
      return { error: 'Não autenticado' };
    }
    if (
      !data ||
      typeof data.conversationId !== 'string' ||
      data.conversationId.length === 0 ||
      data.conversationId.length > 128
    ) {
      return { error: 'Payload inválido' };
    }

    // Participant check: without this, an attacker could spam typing
    // indicators into ANY conversation they know the id of, broadcasting
    // "<attacker> is typing…" to victims in the room. The handler used
    // to emit unconditionally because it looked harmless — but the
    // userId IS included in the payload, so it's a cheap harassment
    // surface.
    if (!(await this.isParticipant(userId, data.conversationId))) {
      return { error: 'Acesso negado' };
    }
    if (!this.checkRate(client.id, 'typing')) {
      return { error: 'too many typing events' };
    }

    // Emit typing indicator to other participants in the conversation
    client.to(`conversation:${data.conversationId}`).emit('typing', {
      conversationId: data.conversationId,
      userId,
    });

    return { ok: true };
  }

  @SubscribeMessage('stopTyping')
  async handleStopTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.socketToUser.get(client.id);
    if (!userId) {
      return { error: 'Não autenticado' };
    }
    if (
      !data ||
      typeof data.conversationId !== 'string' ||
      data.conversationId.length === 0 ||
      data.conversationId.length > 128
    ) {
      return { error: 'Payload inválido' };
    }
    // Same participant check as typing above.
    if (!(await this.isParticipant(userId, data.conversationId))) {
      return { error: 'Acesso negado' };
    }
    if (!this.checkRate(client.id, 'typing')) {
      return { error: 'too many typing events' };
    }

    client.to(`conversation:${data.conversationId}`).emit('stopTyping', {
      conversationId: data.conversationId,
      userId,
    });

    return { ok: true };
  }

  /**
   * Confirm the user is a participant of the given conversation.
   * Used by the typing/stopTyping handlers. The DB hit is small
   * (two scalar columns) and keyed by unique id; cheaper than
   * exposing a room-broadcast to an outsider.
   */
  private async isParticipant(userId: string, conversationId: string): Promise<boolean> {
    const c = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { participant1Id: true, participant2Id: true },
    });
    if (!c) return false;
    return c.participant1Id === userId || c.participant2Id === userId;
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
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.socketToUser.get(client.id);
    if (!userId) {
      return { error: 'Não autenticado' };
    }

    // Verify user is a participant of this conversation
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: data.conversationId },
    });

    if (
      !conversation ||
      (conversation.participant1Id !== userId &&
        conversation.participant2Id !== userId)
    ) {
      return { error: 'Acesso negado' };
    }

    client.join(`conversation:${data.conversationId}`);

    // Track conversation for reconnection
    const convSet = this.userConversations.get(userId) || new Set();
    convSet.add(data.conversationId);
    this.userConversations.set(userId, convSet);

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
