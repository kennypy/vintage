import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { NotaFiscalService } from './notafiscal.service';
import { PrismaService } from '../prisma/prisma.service';
import { NFeClient } from './nfe.client';

const mockPrisma = {
  order: {
    findUnique: jest.fn(),
  },
  notaFiscal: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  $queryRaw: jest.fn(),
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

      await expect(service.generateNFe('nonexistent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.generateNFe('nonexistent', 'user-1')).rejects.toThrow(
        'Pedido não encontrado',
      );
    });

    it('should throw ForbiddenException if user is not buyer or seller', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        itemPriceBrl: 150,
        buyer: { id: 'buyer-1', cpf: '12345678901' },
        seller: { id: 'seller-1', cnpj: null, cpfIdentityVerified: true, addresses: [] },
        shippingAddress: { state: 'RJ' },
        notaFiscal: null,
      });

      await expect(service.generateNFe('order-1', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return existing NF-e if already generated', async () => {
      const existingNfe = {
        nfeId: 'NFe-123',
        orderId: 'order-1',
        accessKey: '12345678901234567890123456789012345678901234',
        xml: '<nfe>...</nfe>',
        pdfUrl: '/nota-fiscal/order-1/pdf',
        status: 'AUTHORIZED',
        issuedAt: new Date(),
      };

      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        itemPriceBrl: 150,
        buyer: { id: 'buyer-1', cpf: '12345678901' },
        seller: { id: 'seller-1', cnpj: null, cpfIdentityVerified: true, addresses: [] },
        shippingAddress: null,
        notaFiscal: existingNfe,
      });

      const result = await service.generateNFe('order-1', 'buyer-1');

      expect(result.orderId).toBe('order-1');
      expect(result.status).toBe('authorized');
      expect(mockNFeClient.generateNFe).not.toHaveBeenCalled();
    });

    it('should generate and persist a new NF-e', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        itemPriceBrl: 150,
        buyer: { id: 'buyer-1', cpf: '12345678901' },
        seller: {
          id: 'seller-1',
          cnpj: '12345678000190',
          cpfIdentityVerified: true,
          addresses: [{ state: 'SP' }],
        },
        shippingAddress: { state: 'RJ' },
        notaFiscal: null,
      });

      const nfeResponse = {
        nfeId: 'NFe-456',
        accessKey: '12345678901234567890123456789012345678901234',
        xml: '<nfe>...</nfe>',
        pdfUrl: '/nota-fiscal/order-1/pdf',
        status: 'authorized',
        issuedAt: new Date().toISOString(),
      };
      mockNFeClient.generateNFe.mockResolvedValue(nfeResponse);

      const persistedNfe = {
        ...nfeResponse,
        orderId: 'order-1',
        status: 'AUTHORIZED',
        issuedAt: new Date(nfeResponse.issuedAt),
      };
      mockPrisma.notaFiscal.create.mockResolvedValue(persistedNfe);

      const result = await service.generateNFe('order-1', 'buyer-1');

      expect(result.orderId).toBe('order-1');
      expect(result.nfeId).toBe('NFe-456');
      expect(result.status).toBe('authorized');
      expect(mockPrisma.notaFiscal.create).toHaveBeenCalledTimes(1);

      // Verify seller CNPJ and buyer CPF were passed to NFeClient
      const clientCall = mockNFeClient.generateNFe.mock.calls[0][0];
      expect(clientCall.sellerCnpj).toBe('12345678000190');
      expect(clientCall.buyerCpf).toBe('12345678901');
      expect(clientCall.originState).toBe('SP');
      expect(clientCall.destinationState).toBe('RJ');
    });
  });

  describe('getNFe', () => {
    it('should throw NotFoundException if NF-e not found', async () => {
      mockPrisma.notaFiscal.findUnique.mockResolvedValue(null);

      await expect(service.getNFe('nonexistent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user is not buyer or seller', async () => {
      mockPrisma.notaFiscal.findUnique.mockResolvedValue({
        nfeId: 'NFe-123',
        orderId: 'order-1',
        accessKey: '12345678901234567890123456789012345678901234',
        xml: '<nfe/>',
        pdfUrl: '/nota-fiscal/order-1/pdf',
        status: 'AUTHORIZED',
        issuedAt: new Date(),
        order: { buyerId: 'buyer-1', sellerId: 'seller-1' },
      });

      await expect(service.getNFe('order-1', 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return NF-e for authorized user', async () => {
      mockPrisma.notaFiscal.findUnique.mockResolvedValue({
        nfeId: 'NFe-123',
        orderId: 'order-1',
        accessKey: '12345678901234567890123456789012345678901234',
        xml: '<nfe/>',
        pdfUrl: '/nota-fiscal/order-1/pdf',
        status: 'AUTHORIZED',
        issuedAt: new Date(),
        order: { buyerId: 'buyer-1', sellerId: 'seller-1' },
      });

      const result = await service.getNFe('order-1', 'seller-1');

      expect(result.orderId).toBe('order-1');
      expect(result.status).toBe('authorized');
    });
  });

  describe('calculateTax', () => {
    it('should calculate SP intrastate tax with 18% ICMS', () => {
      const result = service.calculateTax(100, 'SP', 'SP');

      expect(result.icms).toBe(18);
      expect(result.iss).toBe(0);
      expect(result.total).toBe(18);
      expect(result.effectiveRate).toBe(18);
    });

    it('should calculate RJ intrastate tax with 22% ICMS', () => {
      const result = service.calculateTax(100, 'RJ', 'RJ');

      expect(result.icms).toBe(22);
      expect(result.total).toBe(22);
    });

    it('should calculate interstate tax from SP to RJ at 7%', () => {
      // SP (South/Southeast) to RJ is NOT 7% because RJ is also South/Southeast
      // Actually RJ is Southeast, so SP->RJ is 12%
      const result = service.calculateTax(100, 'SP', 'RJ');

      expect(result.icms).toBe(12);
      expect(result.total).toBe(12);
    });

    it('should use 7% ICMS from South/Southeast to North/Northeast', () => {
      // SP (Southeast) to BA (Northeast) = 7%
      const result = service.calculateTax(100, 'SP', 'BA');

      expect(result.icms).toBe(7);
      expect(result.total).toBe(7);
    });

    it('should use 12% ICMS from North/Northeast to South/Southeast', () => {
      // BA (Northeast) to SP (Southeast) = 12%
      const result = service.calculateTax(100, 'BA', 'SP');

      expect(result.icms).toBe(12);
      expect(result.total).toBe(12);
    });

    it('should not apply ISS to item price (ISS is for platform service fees only)', () => {
      const result = service.calculateTax(200, 'MG', 'MG');

      expect(result.iss).toBe(0);
    });

    it('should handle case-insensitive state comparison', () => {
      const result = service.calculateTax(100, 'sp', 'SP');

      expect(result.icms).toBe(18); // intrastate SP
    });

    it('should round to 2 decimal places', () => {
      const result = service.calculateTax(33.33, 'SP', 'SP');

      // 33.33 * 0.18 = 5.9994 => 6.00
      expect(result.icms).toBe(6);
    });

    it('rejects zero price (input-validation hardening)', () => {
      // Zero-price tax calculation is meaningless — previously we
      // returned a synthetic all-zero response. Pre-launch audit flagged
      // this as an unbounded input path, so calculateTax now refuses
      // non-positive prices at the boundary rather than downstream.
      expect(() => service.calculateTax(0, 'SP', 'RJ')).toThrow();
    });

    it('rejects malformed UFs', () => {
      expect(() => service.calculateTax(100, 'NOTAUF', 'RJ')).toThrow();
      expect(() => service.calculateTax(100, 'SP', '12')).toThrow();
      expect(() => service.calculateTax(100, '', 'RJ')).toThrow();
    });

    it('rejects NaN / Infinity prices', () => {
      expect(() => service.calculateTax(NaN, 'SP', 'RJ')).toThrow();
      expect(() => service.calculateTax(Infinity, 'SP', 'RJ')).toThrow();
    });
  });

  describe('calculatePlatformIssBrl', () => {
    it('should calculate ISS at 5% of commission', () => {
      expect(service.calculatePlatformIssBrl(100)).toBe(5);
      expect(service.calculatePlatformIssBrl(49.90)).toBe(2.5);
    });
  });

  // Wave 3D: background sweep for NF-es stuck in PENDING after the
  // synchronous POST. The provider is the source of truth for status
  // transitions; we NEVER derive AUTHORIZED from user input.
  describe('pollPendingNFeStatus', () => {
    it('promotes PENDING rows that the provider has moved to authorized', async () => {
      mockPrisma.notaFiscal.findMany.mockResolvedValue([
        { id: 'nf-1', nfeId: 'ext-1', orderId: 'ord-1' },
      ]);
      mockNFeClient.getNFe.mockResolvedValue({
        nfeId: 'ext-1',
        accessKey: '44-digit-key',
        xml: '<xml/>',
        pdfUrl: 'https://p/ext-1.pdf',
        status: 'authorized',
        issuedAt: '2026-04-18T12:00:00Z',
      });
      mockPrisma.notaFiscal.update.mockResolvedValue({});

      await service.pollPendingNFeStatus();

      expect(mockPrisma.notaFiscal.update).toHaveBeenCalledWith({
        where: { id: 'nf-1' },
        data: expect.objectContaining({
          status: 'AUTHORIZED',
          accessKey: '44-digit-key',
        }),
      });
    });

    it('leaves PENDING rows untouched when the provider still reports pending', async () => {
      mockPrisma.notaFiscal.findMany.mockResolvedValue([
        { id: 'nf-1', nfeId: 'ext-1', orderId: 'ord-1' },
      ]);
      mockNFeClient.getNFe.mockResolvedValue({
        nfeId: 'ext-1',
        accessKey: '',
        xml: '',
        pdfUrl: '',
        status: 'pending',
        issuedAt: '',
      });

      await service.pollPendingNFeStatus();

      expect(mockPrisma.notaFiscal.update).not.toHaveBeenCalled();
    });

    it('swallows provider errors so one broken row does not poison the sweep', async () => {
      mockPrisma.notaFiscal.findMany.mockResolvedValue([
        { id: 'nf-1', nfeId: 'ext-1', orderId: 'ord-1' },
        { id: 'nf-2', nfeId: 'ext-2', orderId: 'ord-2' },
      ]);
      mockNFeClient.getNFe
        .mockRejectedValueOnce(new Error('provider 500'))
        .mockResolvedValueOnce({
          nfeId: 'ext-2',
          accessKey: 'key-2',
          xml: '<x/>',
          pdfUrl: 'u',
          status: 'authorized',
          issuedAt: '2026-04-18T12:00:00Z',
        });
      mockPrisma.notaFiscal.update.mockResolvedValue({});

      await service.pollPendingNFeStatus();

      // The second row was promoted despite the first throwing.
      expect(mockPrisma.notaFiscal.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'nf-2' } }),
      );
    });

    it('skips rows older than 24h (ops must investigate)', async () => {
      mockPrisma.notaFiscal.findMany.mockResolvedValue([]);

      await service.pollPendingNFeStatus();

      expect(mockPrisma.notaFiscal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({ gt: expect.any(Date) }),
          }),
        }),
      );
      expect(mockNFeClient.getNFe).not.toHaveBeenCalled();
    });
  });
});
