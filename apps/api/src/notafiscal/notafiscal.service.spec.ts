import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotaFiscalService } from './notafiscal.service';
import { PrismaService } from '../prisma/prisma.service';
import { NFeClient } from './nfe.client';

const mockPrisma = {
  order: {
    findUnique: jest.fn(),
  },
};

const mockNFeClient = {
  generateNFe: jest.fn(),
  getNFe: jest.fn(),
};

describe('NotaFiscalService', () => {
  let service: NotaFiscalService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotaFiscalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NFeClient, useValue: mockNFeClient },
      ],
    }).compile();

    service = module.get<NotaFiscalService>(NotaFiscalService);
  });

  describe('generateNFe', () => {
    it('should throw NotFoundException if order not found', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);

      await expect(service.generateNFe('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.generateNFe('nonexistent')).rejects.toThrow(
        'Pedido não encontrado',
      );
    });

    it('should generate a new NF-e for a valid order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({ id: 'order-1', totalBrl: 150 });
      const nfeResponse = {
        nfeId: 'NFe-123',
        accessKey: '12345678901234567890123456789012345678901234',
        xml: '<nfe>...</nfe>',
        pdfUrl: '/nota-fiscal/order-1/pdf',
        status: 'authorized',
        issuedAt: new Date().toISOString(),
      };
      mockNFeClient.generateNFe.mockResolvedValue(nfeResponse);

      const result = await service.generateNFe('order-1');

      expect(result.orderId).toBe('order-1');
      expect(result.nfeId).toBe('NFe-123');
      expect(result.status).toBe('authorized');
      expect(result.accessKey).toBeDefined();
      expect(result.issuedAt).toBeInstanceOf(Date);
    });

    it('should return cached NF-e if already generated', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({ id: 'order-1', totalBrl: 150 });
      const nfeResponse = {
        nfeId: 'NFe-123',
        accessKey: '12345678901234567890123456789012345678901234',
        xml: '<nfe>...</nfe>',
        pdfUrl: '/nota-fiscal/order-1/pdf',
        status: 'authorized',
        issuedAt: new Date().toISOString(),
      };
      mockNFeClient.generateNFe.mockResolvedValue(nfeResponse);

      const first = await service.generateNFe('order-1');
      const second = await service.generateNFe('order-1');

      expect(first.nfeId).toBe(second.nfeId);
      // NFeClient.generateNFe should only be called once (cached on second call)
      expect(mockNFeClient.generateNFe).toHaveBeenCalledTimes(1);
    });
  });

  describe('getNFe', () => {
    it('should throw NotFoundException if NF-e not found', async () => {
      await expect(service.getNFe('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getNFe('nonexistent')).rejects.toThrow(
        'NF-e não encontrada para este pedido',
      );
    });

    it('should return NF-e after it has been generated', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({ id: 'order-1', totalBrl: 100 });
      mockNFeClient.generateNFe.mockResolvedValue({
        nfeId: 'NFe-456',
        accessKey: '12345678901234567890123456789012345678901234',
        xml: '<nfe/>',
        pdfUrl: '/nota-fiscal/order-1/pdf',
        status: 'authorized',
        issuedAt: new Date().toISOString(),
      });
      await service.generateNFe('order-1');

      const result = await service.getNFe('order-1');

      expect(result.orderId).toBe('order-1');
      expect(result.status).toBe('authorized');
    });
  });

  describe('calculateTax', () => {
    it('should calculate intrastate tax with 18% ICMS', () => {
      const result = service.calculateTax(100, 'SP', 'SP');

      expect(result.icms).toBe(18);
      expect(result.iss).toBe(5);
      expect(result.total).toBe(23);
      expect(result.effectiveRate).toBe(23);
    });

    it('should calculate interstate tax with 12% ICMS', () => {
      const result = service.calculateTax(100, 'SP', 'RJ');

      expect(result.icms).toBe(12);
      expect(result.iss).toBe(5);
      expect(result.total).toBe(17);
      expect(result.effectiveRate).toBe(17);
    });

    it('should apply ISS at 5% regardless of state', () => {
      const intra = service.calculateTax(200, 'MG', 'MG');
      const inter = service.calculateTax(200, 'MG', 'PR');

      expect(intra.iss).toBe(10);
      expect(inter.iss).toBe(10);
    });

    it('should handle case-insensitive state comparison', () => {
      const result = service.calculateTax(100, 'sp', 'SP');

      expect(result.icms).toBe(18); // intrastate
    });

    it('should round to 2 decimal places', () => {
      const result = service.calculateTax(33.33, 'SP', 'SP');

      // 33.33 * 0.18 = 5.9994 => 6.00
      expect(result.icms).toBe(6);
      // 33.33 * 0.05 = 1.6665 => 1.67
      expect(result.iss).toBe(1.67);
    });
  });
});
