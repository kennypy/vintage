import { Test, TestingModule } from '@nestjs/testing';
import { ShippingService } from './shipping.service';
import { CorreiosClient } from './correios.client';
import { JadlogClient } from './jadlog.client';
import { KanguClient } from './kangu.client';
import { PegakiClient } from './pegaki.client';
import { ConfigService } from '@nestjs/config';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock'),
}));

const mockConfigService = {
  get: jest.fn().mockReturnValue(''),
};

// generateShippingLabel now asserts the caller is the order's seller.
// Every test below passes 'seller-1' + arranges a matching order row.
const mockPrisma = {
  order: {
    findUnique: jest.fn(),
  },
};

describe('ShippingService', () => {
  let service: ShippingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.order.findUnique.mockResolvedValue({ sellerId: 'seller-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShippingService,
        CorreiosClient,
        JadlogClient,
        KanguClient,
        PegakiClient,
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: require('../prisma/prisma.service').PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<ShippingService>(ShippingService);
  });

  describe('calculateRates', () => {
    it('should return shipping options for all carriers', async () => {
      const result = await service.calculateRates('01010-000', '80000-000', 500);

      expect(result.length).toBeGreaterThanOrEqual(3);
      const correiosOptions = result.filter((r: { carrier: string }) => r.carrier === 'Correios');
      const jadlogOptions = result.filter((r: { carrier: string }) => r.carrier === 'Jadlog');
      expect(correiosOptions.some((r: { serviceName: string }) => r.serviceName === 'PAC')).toBe(true);
      expect(correiosOptions.some((r: { serviceName: string }) => r.serviceName === 'SEDEX')).toBe(true);
      expect(jadlogOptions.some((r: { serviceName: string }) => r.serviceName === '.Package')).toBe(true);
    });

    it('should return options with all required fields', async () => {
      const result = await service.calculateRates('01010-000', '80000-000', 300);

      for (const option of result) {
        expect(option).toHaveProperty('carrier');
        expect(option).toHaveProperty('serviceName');
        expect(option).toHaveProperty('priceBrl');
        expect(option).toHaveProperty('estimatedDays');
        expect(option).toHaveProperty('trackingAvailable');
        expect(typeof option.priceBrl).toBe('number');
        expect(option.priceBrl).toBeGreaterThan(0);
        expect(option.trackingAvailable).toBe(true);
      }
    });
  });

  describe('generateShippingLabel', () => {
    it('should return a label with tracking code and carrier', async () => {
      const result = await service.generateShippingLabel(
        'order-1',
        'Correios',
        'Rua A, 100, SP',
        'Rua B, 200, PR',
        500,
        'seller-1',
      );

      expect(result.trackingCode).toMatch(/^BR/);
      expect(result.trackingCode).toHaveLength(13); // BR + 11 alphanumeric
      expect(result.carrier).toBe('Correios');
      expect(result.labelUrl).toContain('order-1');
      expect(result.estimatedDelivery).toBeDefined();
    });

    it('should generate Jadlog label when carrier is jadlog', async () => {
      const result = await service.generateShippingLabel(
        'order-2',
        'Jadlog',
        'Rua A, 100, SP',
        'Rua B, 200, RJ',
        300,
        'seller-1',
      );

      expect(result.trackingCode).toMatch(/^JD/);
      expect(result.carrier).toBe('Jadlog');
    });

    it('refuses when the caller is not the seller of the order', async () => {
      // IDOR guard — the whole reason this commit exists. Any
      // authenticated non-seller used to be able to burn the real
      // seller's carrier credits / generate spurious labels.
      mockPrisma.order.findUnique.mockResolvedValueOnce({ sellerId: 'seller-2' });
      await expect(
        service.generateShippingLabel(
          'order-3',
          'Correios',
          'Rua A, 100, SP',
          'Rua B, 200, SP',
          200,
          'not-the-seller',
        ),
      ).rejects.toThrow();
    });

    it('refuses when the order does not exist', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.generateShippingLabel(
          'order-missing',
          'Correios',
          'Rua A',
          'Rua B',
          200,
          'seller-1',
        ),
      ).rejects.toThrow();
    });
  });

  describe('getTrackingStatus', () => {
    it('should return tracking events for Correios codes', async () => {
      const result = await service.getTrackingStatus('BR12345678901');

      expect(result.length).toBeGreaterThan(0);
      for (const event of result) {
        expect(event).toHaveProperty('status');
        expect(event).toHaveProperty('location');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('description');
      }
    });

    it('should include POSTED, IN_TRANSIT, and OUT_FOR_DELIVERY events', async () => {
      const result = await service.getTrackingStatus('BR12345678901');

      const statuses = result.map((e: { status: string }) => e.status);
      expect(statuses).toContain('POSTED');
      expect(statuses).toContain('IN_TRANSIT');
      expect(statuses).toContain('OUT_FOR_DELIVERY');
    });

    it('should return Jadlog tracking for JD-prefixed codes', async () => {
      const result = await service.getTrackingStatus('JD12345678901');

      expect(result.length).toBeGreaterThan(0);
      const statuses = result.map((e: { status: string }) => e.status);
      expect(statuses).toContain('COLETADO');
    });
  });

  describe('getDropoffPoints', () => {
    it('should return all dropoff points when no carrier filter', async () => {
      const result = await service.getDropoffPoints('01010-000');

      expect(result.length).toBeGreaterThan(0);
      const carriers = new Set(result.map((p: { carrier: string }) => p.carrier));
      expect(carriers.size).toBeGreaterThan(1);
    });

    it('should filter by carrier when specified', async () => {
      const result = await service.getDropoffPoints('01010-000', 'Correios');

      expect(result.length).toBeGreaterThan(0);
      for (const point of result) {
        expect(point.carrier).toBe('Correios');
      }
    });

    it('should filter by Jadlog carrier', async () => {
      const result = await service.getDropoffPoints('01010-000', 'Jadlog');

      expect(result.length).toBeGreaterThan(0);
      for (const point of result) {
        expect(point.carrier).toBe('Jadlog');
      }
    });
  });
});
