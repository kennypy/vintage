import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { containsProhibitedContent } from '@vintage/shared';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async getConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        OR: [{ participant1Id: userId }, { participant2Id: userId }],
      },
      include: {
        participant1: { select: { id: true, name: true, avatarUrl: true } },
        participant2: { select: { id: true, name: true, avatarUrl: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    return conversations.map((c) => {
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
    });

    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    if (conversation.participant1Id !== userId && conversation.participant2Id !== userId) {
      throw new ForbiddenException('Acesso negado');
    }

    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
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

    return { items: items.reverse(), total, page, pageSize, hasMore: skip + items.length < total };
  }

  async sendMessage(conversationId: string, senderId: string, body: string) {
    if (containsProhibitedContent(body).matched) {
      throw new BadRequestException('Sua mensagem contém termos não permitidos na plataforma.');
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    if (conversation.participant1Id !== senderId && conversation.participant2Id !== senderId) {
      throw new ForbiddenException('Acesso negado');
    }

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId, senderId, body },
        include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return message;
  }

  async startConversation(userId: string, otherUserId: string) {
    if (userId === otherUserId) {
      throw new ForbiddenException('Não é possível iniciar conversa consigo mesmo');
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
