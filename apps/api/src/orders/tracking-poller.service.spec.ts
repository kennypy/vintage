import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  TrackingPollerService,
  isDeliveredEvent,
} from './tracking-poller.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingService, TrackingEvent } from '../shipping/shipping.service';
import { CronLockService } from '../common/services/cron-lock.service';
import { OrdersService } from './orders.service';
import { ReturnsService } from '../returns/returns.service';

describe('isDeliveredEvent (carrier-agnostic predicate)', () => {
  const evt = (status: string, description = ''): TrackingEvent => ({
    status,
    description,
    location: '',
    timestamp: '',
  });

  it.each([
    ['BDE', 'Objeto entregue ao destinatário'], // Correios
    ['ENTREGUE', 'Mercadoria entregue'], // Jadlog / Kangu / Pegaki
    ['DELIVERED', 'Package delivered'], // English-language fallback
    ['delivered', ''], // case-insensitive
  ])('classifies (%s / %s) as delivered', (status, description) => {
    expect(isDeliveredEvent(evt(status, description))).toBe(true);
  });

  it.each([
    ['POSTED', 'Objeto postado'],
    ['IN_TRANSIT', 'Em trânsito'],
    ['OUT_FOR_DELIVERY', 'Saiu para entrega'],
    ['COLETADO', 'Coletado pelo carrier'],
    ['', 'Aguardando retirada'],
  ])('classifies (%s / %s) as NOT delivered', (status, description) => {
    expect(isDeliveredEvent(evt(status, description))).toBe(false);
  });

  // Critical negation: carriers emit "NÃO ENTREGUE" / "FALHA NA ENTREGA"
  // which contains the substring ENTREGUE. Must NOT flip the order.
  it.each([
    ['FALHA', 'Falha na entrega — tentativa 1'],
    ['NAO_ENTREGUE', 'NAO ENTREGUE — destinatário ausente'],
    ['NAO_ENTREGUE', 'NÃO ENTREGUE'],
  ])('refuses to classify negation (%s / %s) as delivered', (status, description) => {
    expect(isDeliveredEvent(evt(status, description))).toBe(false);
  });
});

describe('TrackingPollerService', () => {
  let service: TrackingPollerService;

  const mockPrisma = {
    order: { findMany: jest.fn() },
    orderReturn: { findMany: jest.fn().mockResolvedValue([]) },
  };
  // The poller now calls markDeliveredInternal(orderId, null) — the
  // "null" userId signals a system caller and skips the buyer/seller
  // ownership gate that the HTTP endpoint requires.
  const mockOrders = {
    markDelivered: jest.fn(),
    markDeliveredInternal: jest.fn(),
  };
  const mockShipping = { getTrackingStatus: jest.fn() };
  const mockCronLock = { acquire: jest.fn().mockResolvedValue(true) };
  const mockReturns = { markReceivedByTracking: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.orderReturn.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrackingPollerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OrdersService, useValue: mockOrders },
        { provide: ShippingService, useValue: mockShipping },
        { provide: CronLockService, useValue: mockCronLock },
        { provide: ReturnsService, useValue: mockReturns },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_k, def) => def) },
        },
      ],
    }).compile();

    service = module.get<TrackingPollerService>(TrackingPollerService);
  });

  it('returns silently when cron-lock is held by another replica', async () => {
    mockCronLock.acquire.mockResolvedValueOnce(false);

    await service.pollInFlightShipments();

    expect(mockPrisma.order.findMany).not.toHaveBeenCalled();
    expect(mockShipping.getTrackingStatus).not.toHaveBeenCalled();
  });

  it('returns silently when there are no SHIPPED orders to poll', async () => {
    mockPrisma.order.findMany.mockResolvedValue([]);

    await service.pollInFlightShipments();

    expect(mockShipping.getTrackingStatus).not.toHaveBeenCalled();
    expect(mockOrders.markDeliveredInternal).not.toHaveBeenCalled();
  });

  it('flips an order to DELIVERED when the carrier reports BDE', async () => {
    mockPrisma.order.findMany.mockResolvedValue([
      { id: 'order-1', trackingCode: 'BR12345', carrier: 'CORREIOS' },
    ]);
    mockShipping.getTrackingStatus.mockResolvedValue([
      { status: 'POSTED', description: 'Objeto postado', location: '', timestamp: '' },
      { status: 'BDE', description: 'Objeto entregue ao destinatário', location: '', timestamp: '' },
    ]);

    await service.pollInFlightShipments();

    expect(mockShipping.getTrackingStatus).toHaveBeenCalledWith('BR12345');
    expect(mockOrders.markDeliveredInternal).toHaveBeenCalledWith('order-1', null);
  });

  it('does NOT flip an order whose events never include a delivery', async () => {
    mockPrisma.order.findMany.mockResolvedValue([
      { id: 'order-1', trackingCode: 'BR12345', carrier: 'CORREIOS' },
    ]);
    mockShipping.getTrackingStatus.mockResolvedValue([
      { status: 'IN_TRANSIT', description: 'Em trânsito', location: '', timestamp: '' },
    ]);

    await service.pollInFlightShipments();

    expect(mockOrders.markDeliveredInternal).not.toHaveBeenCalled();
  });

  it('continues polling other orders when one carrier call throws', async () => {
    mockPrisma.order.findMany.mockResolvedValue([
      { id: 'order-1', trackingCode: 'BR1', carrier: 'CORREIOS' },
      { id: 'order-2', trackingCode: 'JD2', carrier: 'JADLOG' },
    ]);
    mockShipping.getTrackingStatus
      .mockRejectedValueOnce(new Error('SRO 503'))
      .mockResolvedValueOnce([
        { status: 'ENTREGUE', description: 'Mercadoria entregue', location: '', timestamp: '' },
      ]);

    await service.pollInFlightShipments();

    // The first order throws, but the loop doesn't exit — the second
    // order still gets checked and flipped.
    expect(mockShipping.getTrackingStatus).toHaveBeenCalledTimes(2);
    expect(mockOrders.markDeliveredInternal).toHaveBeenCalledWith('order-2', null);
  });

  it('swallows markDelivered failures (already past SHIPPED)', async () => {
    mockPrisma.order.findMany.mockResolvedValue([
      { id: 'order-1', trackingCode: 'BR1', carrier: 'CORREIOS' },
    ]);
    mockShipping.getTrackingStatus.mockResolvedValue([
      { status: 'ENTREGUE', description: 'Entregue', location: '', timestamp: '' },
    ]);
    mockOrders.markDeliveredInternal.mockRejectedValueOnce(
      new Error('Pedido precisa estar enviado para marcar como entregue'),
    );

    await expect(service.pollInFlightShipments()).resolves.not.toThrow();
  });
});
