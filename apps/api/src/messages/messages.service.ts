import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { containsProhibitedContent } from '@vintage/shared';

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Returns true if either user is banned, soft-deleted, or has blocked
   * the other. Used to gate messaging, offers and other inter-user actions.
   */
  private async isBlocked(a: string, b: string): Promise<boolean> {
    const [users, block] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: [a, b] } },
        select: { id: true, isBanned: true, deletedAt: true },
      }),
      this.prisma.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: a, blockedId: b },
            { blockerId: b, blockedId: a },
          ],
        },
        select: { id: true },
      }),
    ]);
    if (users.some((u) => u.isBanned || u.deletedAt)) return true;
    return !!block;
  }

  async getConversations(userId: string) {
    const [conversations, blocks] = await Promise.all([
      this.prisma.conversation.findMany({
        where: {
          OR: [{ participant1Id: userId }, { participant2Id: userId }],
        },
        include: {
          participant1: { select: { id: true, name: true, avatarUrl: true } },
          participant2: { select: { id: true, name: true, avatarUrl: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { lastMessageAt: 'desc' },
      }),
      this.prisma.userBlock.findMany({
        where: {
          OR: [{ blockerId: userId }, { blockedId: userId }],
        },
        select: { blockerId: true, blockedId: true },
      }),
    ]);

    const hiddenIds = new Set<string>();
    for (const b of blocks) {
      hiddenIds.add(b.blockerId === userId ? b.blockedId : b.blockerId);
    }

    return conversations
      .filter((c) => {
        const other = c.participant1Id === userId ? c.participant2Id : c.participant1Id;
        return !hiddenIds.has(other);
      })
      .map((c) => {
        const otherUser = c.participant1Id === userId ? c.participant2 : c.participant1;
        return {
          id: c.id,
          otherUser,
          lastMessage: c.messages[0] ?? null,
          lastMessageAt: c.lastMessageAt,
          orderId: c.orderId,
        };
      });
  }

  async getMessages(conversationId: string, userId: string, page: number = 1, pageSize: number = 50) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participant1: { select: { id: true, name: true, avatarUrl: true } },
        participant2: { select: { id: true, name: true, avatarUrl: true } },
        order: {
          select: {
            listing: {
              select: {
                id: true,
                title: true,
                priceBrl: true,
                images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
              },
            },
          },
        },
      },
    });

    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    if (conversation.participant1Id !== userId && conversation.participant2Id !== userId) {
      throw new ForbiddenException('Acesso negado');
    }

    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pageSize) || 50));
    const skip = (page - 1) * pageSize;
    const [raw, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.message.count({ where: { conversationId } }),
    ]);

    // Mark unread messages as read
    await this.prisma.message.updateMany({
      where: { conversationId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });

    const messages = raw.reverse().map((m) => ({ ...m, isOwn: m.senderId === userId }));

    const otherUser =
      conversation.participant1Id === userId ? conversation.participant2 : conversation.participant1;

    const listing = conversation.order?.listing
      ? {
          id: conversation.order.listing.id,
          title: conversation.order.listing.title,
          priceBrl: Number(conversation.order.listing.priceBrl),
          imageUrl: conversation.order.listing.images[0]?.url,
        }
      : null;

    const pageSizeOut = pageSize;
    return {
      id: conversation.id,
      otherUser,
      listing,
      // `messages` is what the web conversation page reads;
      // `items` is kept as an alias so the mobile client's
      // MessagesResponse shape continues to work unchanged.
      messages,
      items: messages,
      total,
      page,
      pageSize: pageSizeOut,
      totalPages: Math.ceil(total / pageSizeOut) || 1,
      hasMore: skip + raw.length < total,
    };
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    body: string,
    imageUrl?: string,
  ) {
    if (containsProhibitedContent(body).matched) {
      throw new BadRequestException('Sua mensagem contém termos não permitidos na plataforma.');
    }

    // Image attachments must come from our S3 upload pipeline. Rejecting
    // arbitrary URLs here is a cheap SSRF / phishing-link-in-chat defence
    // — the UI is expected to upload first, then send the resulting URL.
    if (imageUrl !== undefined) {
      if (typeof imageUrl !== 'string' || imageUrl.length > 1024) {
        throw new BadRequestException('URL de imagem inválida');
      }
      if (!/^https:\/\//i.test(imageUrl)) {
        throw new BadRequestException('Imagem deve ser carregada pelo app antes de enviar');
      }
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    if (conversation.participant1Id !== senderId && conversation.participant2Id !== senderId) {
      throw new ForbiddenException('Acesso negado');
    }

    // Reject if either side is banned, deleted, or blocked either direction
    const otherId =
      conversation.participant1Id === senderId
        ? conversation.participant2Id
        : conversation.participant1Id;
    if (await this.isBlocked(senderId, otherId)) {
      throw new ForbiddenException(
        'Não é possível enviar mensagens para este usuário.',
      );
    }

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId, senderId, body, imageUrl },
        include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    // Notify the recipient. Fire-and-forget — a down NotificationsService
    // must never break the message delivery itself; the bell entry is a
    // side channel for the real thing (the Message row).
    this.notifications
      .createNotification(
        otherId,
        'NEW_MESSAGE',
        `${message.sender.name ?? 'Alguém'} te mandou uma mensagem`,
        body.slice(0, 140),
        { conversationId, messageId: message.id, senderId },
        'messages',
      )
      .catch(() => {
        /* notification failures must not break chat */
      });

    return message;
  }

  async startConversation(userId: string, otherUserId: string) {
    if (userId === otherUserId) {
      throw new ForbiddenException('Não é possível iniciar conversa consigo mesmo');
    }

    if (await this.isBlocked(userId, otherUserId)) {
      throw new ForbiddenException(
        'Não é possível iniciar conversa com este usuário.',
      );
    }

    // Check if conversation already exists (order doesn't matter)
    const [id1, id2] = [userId, otherUserId].sort();
    const existing = await this.prisma.conversation.findFirst({
      where: {
        OR: [
          { participant1Id: id1, participant2Id: id2 },
          { participant1Id: id2, participant2Id: id1 },
        ],
      },
    });

    if (existing) return existing;

    return this.prisma.conversation.create({
      data: { participant1Id: id1, participant2Id: id2 },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    // Count all unread messages across all conversations for this user
    const conversations = await this.prisma.conversation.findMany({
      where: {
        OR: [{ participant1Id: userId }, { participant2Id: userId }],
      },
      select: { id: true },
    });

    const conversationIds = conversations.map((c) => c.id);
    if (conversationIds.length === 0) return 0;

    return this.prisma.message.count({
      where: {
        conversationId: { in: conversationIds },
        senderId: { not: userId },
        readAt: null,
      },
    });
  }

  async markConversationRead(conversationId: string, userId: string): Promise<number> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    if (conversation.participant1Id !== userId && conversation.participant2Id !== userId) {
      throw new ForbiddenException('Acesso negado');
    }

    const result = await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return result.count;
  }
}
