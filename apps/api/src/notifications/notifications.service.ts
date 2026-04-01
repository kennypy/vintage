import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private pushService: PushService,
  ) {}

  async getNotifications(userId: string, page: number = 1, pageSize: number = 20) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.max(1, Number(pageSize) || 20);
    const skip = (p - 1) * ps;
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: ps,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return { items, total, unreadCount, page: p, pageSize: ps, hasMore: skip + items.length < total };
  }

  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) throw new NotFoundException('Notificação não encontrada');

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  // Helper to create notifications from other services
  async createNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    data: Record<string, unknown> = {},
  ) {
    const notification = await this.prisma.notification.create({
      data: { userId, type, title, body, data: data as object },
    });

    // Send push notification (non-blocking, non-critical)
    const pushData: Record<string, string> = { type };
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        pushData[key] = value;
      }
    }
    this.pushService.sendPushNotification(userId, title, body, pushData);

    return notification;
  }
}
