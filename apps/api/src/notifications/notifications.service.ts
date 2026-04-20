import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

/**
 * Category of notification. Maps 1:1 to the category toggles on the
 * user's notification preferences (see User.notif* columns + the web's
 * NotificationPreferences interface in apps/web/src/app/notifications/page.tsx).
 *
 * Callers that don't pass a category (security alerts, moderation
 * actions, system auto-pause, admin flags) are treated as
 * "always-deliver" and only respect the channel-level pushEnabled flag.
 * That mirrors the email policy: transactional messages can't be
 * silenced, only channels can.
 */
export type NotificationCategory =
  | 'orders'
  | 'messages'
  | 'offers'
  | 'followers'
  | 'priceDrops'
  | 'promotions'
  | 'news';

// Mapping from category value to the DB column holding its toggle.
// Kept here (not in users.service.ts) because this is the module that
// reads the flag to decide delivery. users.service only translates to
// the flat web-facing shape at API response time.
const CATEGORY_COLUMN: Record<NotificationCategory, keyof PrefsRow> = {
  orders: 'notifOrders',
  messages: 'notifMessages',
  offers: 'notifOffers',
  followers: 'notifFollowers',
  priceDrops: 'notifPriceDrops',
  promotions: 'notifPromotions',
  news: 'notifNews',
};

type PrefsRow = {
  pushEnabled: boolean;
  notifOrders: boolean;
  notifMessages: boolean;
  notifOffers: boolean;
  notifFollowers: boolean;
  notifPriceDrops: boolean;
  notifPromotions: boolean;
  notifNews: boolean;
};

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private pushService: PushService,
  ) {}

  async getNotifications(userId: string, page: number = 1, pageSize: number = 20) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
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

  /**
   * Create an in-app notification and (conditionally) fire a push.
   *
   * Preference gating:
   *   - `category` supplied + user turned it off → skip BOTH the in-app
   *     bell entry AND the push. Intent is "I don't care about this class".
   *   - `category` supplied + user left it on → create bell entry; push
   *     only if pushEnabled.
   *   - `category` omitted (security alerts, listing moderation, system
   *     events, admin flags) → always create the bell entry; push only
   *     if pushEnabled. Mirrors the transactional-email policy: these
   *     messages exist to keep the user informed about consequential
   *     account/listing events that can't be reasonably muted.
   *
   * Push delivery itself is non-blocking and swallows errors — a
   * notification is primarily the bell row; the push is best-effort.
   */
  async createNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    data: Record<string, unknown> = {},
    category?: NotificationCategory,
  ) {
    const prefs = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        pushEnabled: true,
        notifOrders: true,
        notifMessages: true,
        notifOffers: true,
        notifFollowers: true,
        notifPriceDrops: true,
        notifPromotions: true,
        notifNews: true,
      },
    });
    // If the user vanished between the triggering event and this call,
    // don't create a dangling notification. Return null so callers that
    // await can detect the no-op cheaply.
    if (!prefs) return null;

    if (category && !prefs[CATEGORY_COLUMN[category]]) {
      return null;
    }

    const notification = await this.prisma.notification.create({
      data: { userId, type, title, body, data: data as object },
    });

    if (prefs.pushEnabled) {
      const pushData: Record<string, string> = { type };
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string') {
          pushData[key] = value;
        }
      }
      this.pushService.sendPushNotification(userId, title, body, pushData);
    }

    return notification;
  }
}
