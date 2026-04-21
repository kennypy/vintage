import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { RedisService } from '../common/services/redis.service';

const mockPushService = {
  sendPushNotification: jest.fn(),
};

const mockRedis = {
  // Default: 1 means "this is the first call today" — below any cap.
  // Individual tests override to exercise the over-cap path.
  incrWithTtl: jest.fn().mockResolvedValue(1),
};

const mockPrisma = {
  notification: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

// All-on default, used in tests that don't exercise the preference
// gating. Each flag defaults to true in the migration so this matches
// what every user row looks like immediately after upgrade.
const ALL_ON_PREFS = {
  pushEnabled: true,
  notifOrders: true,
  notifMessages: true,
  notifOffers: true,
  notifFollowers: true,
  notifPriceDrops: true,
  notifPromotions: true,
  notifNews: true,
  notifReviews: true,
  notifFavorites: true,
  notifDailyCap: 0,
};

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.incrWithTtl.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PushService, useValue: mockPushService },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('getNotifications', () => {
    it('should return paginated notifications with unreadCount', async () => {
      const notifications = [
        { id: 'notif-1', type: 'ORDER', title: 'Novo pedido', readAt: null },
        { id: 'notif-2', type: 'MESSAGE', title: 'Nova mensagem', readAt: new Date() },
      ];
      mockPrisma.notification.findMany.mockResolvedValue(notifications);
      mockPrisma.notification.count
        .mockResolvedValueOnce(2)  // total
        .mockResolvedValueOnce(1); // unreadCount

      const result = await service.getNotifications('user-1', 1, 20);

      expect(result).toEqual({
        items: notifications,
        total: 2,
        unreadCount: 1,
        page: 1,
        pageSize: 20,
        hasMore: false,
      });
    });

    it('should calculate hasMore correctly', async () => {
      const notifications = Array.from({ length: 10 }, (_, i) => ({ id: `notif-${i}` }));
      mockPrisma.notification.findMany.mockResolvedValue(notifications);
      mockPrisma.notification.count
        .mockResolvedValueOnce(30)
        .mockResolvedValueOnce(5);

      const result = await service.getNotifications('user-1', 1, 10);

      expect(result.hasMore).toBe(true);
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read', async () => {
      const notification = { id: 'notif-1', userId: 'user-1', readAt: null };
      mockPrisma.notification.findFirst.mockResolvedValue(notification);
      const updatedNotification = { ...notification, readAt: new Date() };
      mockPrisma.notification.update.mockResolvedValue(updatedNotification);

      const result = await service.markAsRead('notif-1', 'user-1');

      expect(result).toEqual(updatedNotification);
      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'notif-1' },
          data: expect.objectContaining({ readAt: expect.any(Date) }),
        }),
      );
    });

    it('should throw NotFoundException if notification not found', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markAsRead('nonexistent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.markAsRead('nonexistent', 'user-1')).rejects.toThrow(
        'Notificação não encontrada',
      );
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllAsRead('user-1');

      expect(result).toEqual({ success: true });
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', readAt: null },
          data: expect.objectContaining({ readAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('createNotification', () => {
    it('should create a notification with all prefs on (baseline)', async () => {
      const notification = {
        id: 'notif-1',
        userId: 'user-1',
        type: 'ORDER',
        title: 'Novo pedido',
        body: 'Você recebeu um novo pedido',
        data: { orderId: 'order-1' },
      };
      mockPrisma.user.findUnique.mockResolvedValue(ALL_ON_PREFS);
      mockPrisma.notification.create.mockResolvedValue(notification);

      const result = await service.createNotification(
        'user-1',
        'ORDER',
        'Novo pedido',
        'Você recebeu um novo pedido',
        { orderId: 'order-1' },
      );

      expect(result).toEqual(notification);
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: 'ORDER',
          title: 'Novo pedido',
          body: 'Você recebeu um novo pedido',
          data: { orderId: 'order-1' },
        },
      });
      expect(mockPushService.sendPushNotification).toHaveBeenCalledTimes(1);
    });

    it('returns null and skips both DB + push when the category is off', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...ALL_ON_PREFS,
        notifOrders: false,
      });

      const result = await service.createNotification(
        'user-1',
        'order',
        'Nova venda!',
        'body',
        { orderId: 'o1' },
        'orders',
      );

      expect(result).toBeNull();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(mockPushService.sendPushNotification).not.toHaveBeenCalled();
    });

    it('creates in-app but skips push when pushEnabled=false', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...ALL_ON_PREFS,
        pushEnabled: false,
      });
      mockPrisma.notification.create.mockResolvedValue({ id: 'n1' });

      await service.createNotification(
        'user-1',
        'order',
        'Nova venda!',
        'body',
        { orderId: 'o1' },
        'orders',
      );

      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
      expect(mockPushService.sendPushNotification).not.toHaveBeenCalled();
    });

    it('always-delivers system notifications (no category) regardless of category flags', async () => {
      // All category flags off — should NOT prevent a security/system alert.
      mockPrisma.user.findUnique.mockResolvedValue({
        pushEnabled: true,
        notifOrders: false,
        notifMessages: false,
        notifOffers: false,
        notifFollowers: false,
        notifPriceDrops: false,
        notifPromotions: false,
        notifNews: false,
      });
      mockPrisma.notification.create.mockResolvedValue({ id: 'n1' });

      await service.createNotification(
        'user-1',
        'NEW_DEVICE_LOGIN',
        'Novo login detectado',
        'body',
        {},
      );

      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
      expect(mockPushService.sendPushNotification).toHaveBeenCalledTimes(1);
    });

    it('returns null when the user no longer exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.createNotification(
        'ghost-user',
        'order',
        't',
        'b',
        {},
        'orders',
      );

      expect(result).toBeNull();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(mockPushService.sendPushNotification).not.toHaveBeenCalled();
    });
  });
});
