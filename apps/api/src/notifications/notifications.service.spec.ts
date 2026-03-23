import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  notification: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
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
    it('should create a notification', async () => {
      const notification = {
        id: 'notif-1',
        userId: 'user-1',
        type: 'ORDER',
        title: 'Novo pedido',
        body: 'Você recebeu um novo pedido',
        data: { orderId: 'order-1' },
      };
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
    });
  });
});
