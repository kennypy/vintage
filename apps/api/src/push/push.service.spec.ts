import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PushService } from './push.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('firebase-admin', () => {
  const mockSendEachForMulticast = jest.fn().mockResolvedValue({
    successCount: 1,
    failureCount: 0,
    responses: [{ success: true }],
  });

  return {
    credential: {
      cert: jest.fn().mockReturnValue('mock-credential'),
    },
    initializeApp: jest.fn().mockReturnValue({
      messaging: jest.fn().mockReturnValue({
        sendEachForMulticast: mockSendEachForMulticast,
      }),
    }),
  };
});

const mockPrisma = {
  deviceToken: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};

describe('PushService', () => {
  describe('development mode (no Firebase)', () => {
    let service: PushService;

    beforeEach(async () => {
      jest.clearAllMocks();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PushService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
          { provide: PrismaService, useValue: mockPrisma },
        ],
      }).compile();

      service = module.get<PushService>(PushService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should log push notification in dev mode without throwing', async () => {
      mockPrisma.deviceToken.findMany.mockResolvedValue([
        { token: 'token-1' },
      ]);

      await expect(
        service.sendPushNotification('user-1', 'Título', 'Corpo'),
      ).resolves.toBeUndefined();
    });

    it('should not throw when no device tokens exist', async () => {
      mockPrisma.deviceToken.findMany.mockResolvedValue([]);

      await expect(
        service.sendPushNotification('user-1', 'Título', 'Corpo'),
      ).resolves.toBeUndefined();
    });

    it('should register a device token', async () => {
      mockPrisma.deviceToken.upsert.mockResolvedValue({
        id: 'dt-1',
        userId: 'user-1',
        token: 'token-1',
        platform: 'ios',
      });

      await service.registerDeviceToken('user-1', 'token-1', 'ios');

      expect(mockPrisma.deviceToken.upsert).toHaveBeenCalledWith({
        where: { token: 'token-1' },
        update: { userId: 'user-1', platform: 'ios' },
        create: { userId: 'user-1', token: 'token-1', platform: 'ios' },
      });
    });

    it('should remove a device token', async () => {
      mockPrisma.deviceToken.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeDeviceToken('user-1', 'token-1');

      expect(mockPrisma.deviceToken.deleteMany).toHaveBeenCalledWith({
        where: { token: 'token-1', userId: 'user-1' },
      });
    });
  });

  describe('production mode (Firebase configured)', () => {
    let service: PushService;

    beforeEach(async () => {
      jest.clearAllMocks();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PushService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockImplementation((key: string) => {
                if (key === 'FIREBASE_SERVICE_ACCOUNT_JSON') {
                  return JSON.stringify({
                    project_id: 'test-project',
                    private_key: 'test-key',
                    client_email: 'test@test.iam.gserviceaccount.com',
                  });
                }
                return undefined;
              }),
            },
          },
          { provide: PrismaService, useValue: mockPrisma },
        ],
      }).compile();

      service = module.get<PushService>(PushService);
    });

    it('should send push notification via Firebase', async () => {
      mockPrisma.deviceToken.findMany.mockResolvedValue([
        { token: 'token-1' },
      ]);

      await expect(
        service.sendPushNotification('user-1', 'Título', 'Corpo', {
          orderId: 'order-1',
        }),
      ).resolves.toBeUndefined();

      expect(mockPrisma.deviceToken.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: { token: true },
      });
    });

    it('should handle Firebase send failures without throwing', async () => {
      mockPrisma.deviceToken.findMany.mockResolvedValue([
        { token: 'token-1' },
      ]);

      const firebaseAdmin = require('firebase-admin');
      const mockMessaging = firebaseAdmin.initializeApp().messaging();
      mockMessaging.sendEachForMulticast.mockResolvedValueOnce({
        successCount: 0,
        failureCount: 1,
        responses: [
          { success: false, error: new Error('Invalid token') },
        ],
      });

      await expect(
        service.sendPushNotification('user-1', 'Título', 'Corpo'),
      ).resolves.toBeUndefined();
    });
  });
});
