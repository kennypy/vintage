import { Test, TestingModule } from '@nestjs/testing';
import { TrackingService } from './tracking.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserEventType } from '@prisma/client';

const mockPrisma = {
  userEvent: {
    create: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  deviceLink: {
    upsert: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  userAdProfile: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

describe('TrackingService', () => {
  let service: TrackingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrackingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<TrackingService>(TrackingService);
    jest.clearAllMocks();
  });

  it('tracks an anonymous event', async () => {
    mockPrisma.userEvent.create.mockResolvedValue({});
    await service.trackEvent(
      {
        eventType: UserEventType.LISTING_VIEW,
        sessionId: 'sess-1',
        entityType: 'listing',
        entityId: 'lst-1',
      },
      null,
      '192.168.1.1',
    );
    // Fire-and-forget — give the promise a tick to resolve
    await new Promise((r) => process.nextTick(r));
    expect(mockPrisma.userEvent.create).toHaveBeenCalledTimes(1);
  });

  it('upserts device link when userId and deviceId are present', async () => {
    mockPrisma.userEvent.create.mockResolvedValue({});
    mockPrisma.deviceLink.upsert.mockResolvedValue({});
    await service.trackEvent(
      {
        eventType: UserEventType.LISTING_VIEW,
        sessionId: 'sess-2',
        deviceId: 'abc123',
        platform: 'web',
      },
      'user-1',
      '10.0.0.1',
    );
    await new Promise((r) => process.nextTick(r));
    expect(mockPrisma.deviceLink.upsert).toHaveBeenCalledTimes(1);
  });

  it('sanitises metadata — removes nested objects', async () => {
    mockPrisma.userEvent.create.mockResolvedValue({});
    await service.trackEvent(
      {
        eventType: UserEventType.SEARCH,
        sessionId: 'sess-3',
        metadata: { q: 'vestido', nested: { bad: true }, count: 5 } as Record<string, unknown>,
      },
      null,
      '1.2.3.4',
    );
    await new Promise((r) => process.nextTick(r));
    const callArg = mockPrisma.userEvent.create.mock.calls[0][0];
    expect(callArg.data.metadata).toEqual({ q: 'vestido', count: 5 });
  });

  it('links anonymous session events to user on login', async () => {
    await service.linkSessionToUser('sess-anon', 'user-2');
    expect(mockPrisma.userEvent.updateMany).toHaveBeenCalledWith({
      where: { sessionId: 'sess-anon', userId: null },
      data: { userId: 'user-2' },
    });
  });
});
