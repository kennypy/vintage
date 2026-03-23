import { Test, TestingModule } from '@nestjs/testing';
import { ShippingService } from './shipping.service';
import { CorreiosClient } from './correios.client';
import { JadlogClient } from './jadlog.client';
import { ConfigService } from '@nestjs/config';

const mockConfigService = {
  get: jest.fn().mockReturnValue(''),
};

describe('ShippingService', () => {
  let service: ShippingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShippingService,
        CorreiosClient,
        JadlogClient,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ShippingService>(ShippingService);
  });

  describe('calculateRates', () => {
    it('should return 3 shipping options for all carriers', async () => {
      const result = await service.calculateRates('01010-000', '80000-000', 500);

      expect(result).toHaveLength(3);
      expect(result[0].carrier).toBe('Correios');
      expect(result[0].serviceName).toBe('PAC');
      expect(result[1].carrier).toBe('Correios');
      expect(result[1].serviceName).toBe('SEDEX');
      expect(result[2].carrier).toBe('Jadlog');
      expect(result[2].serviceName).toBe('.Package');
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
      );

      expect(result.trackingCode).toMatch(/^JD/);
      expect(result.carrier).toBe('Jadlog');
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
    it('should return all dropoff points when no carrier filter', () => {
      const result = service.getDropoffPoints('01010-000');

      expect(result.length).toBeGreaterThan(0);
      const carriers = new Set(result.map((p) => p.carrier));
      expect(carriers.size).toBeGreaterThan(1);
    });

    it('should filter by carrier when specified', () => {
      const result = service.getDropoffPoints('01010-000', 'Correios');

      expect(result.length).toBeGreaterThan(0);
      for (const point of result) {
        expect(point.carrier).toBe('Correios');
      }
    });

    it('should filter by Jadlog carrier', () => {
      const result = service.getDropoffPoints('01010-000', 'Jadlog');

      expect(result.length).toBeGreaterThan(0);
      for (const point of result) {
        expect(point.carrier).toBe('Jadlog');
      }
    });
  });
});
