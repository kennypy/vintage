import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NFeClient } from './nfe.client';

export interface NFeData {
  nfeId: string;
  orderId: string;
  accessKey: string;
  xml: string;
  pdfUrl: string;
  status: 'authorized' | 'pending' | 'rejected';
  issuedAt: Date;
}

export interface TaxBreakdown {
  icms: number;
  iss: number;
  total: number;
  effectiveRate: number;
}

@Injectable()
export class NotaFiscalService {
  private readonly logger = new Logger(NotaFiscalService.name);
  // In-memory cache for fast lookup — authoritative data comes from NFeClient
  private nfeCache: Map<string, NFeData> = new Map();

  constructor(
    private prisma: PrismaService,
    private readonly nfeClient: NFeClient,
  ) {}

  async generateNFe(orderId: string): Promise<NFeData> {
    // Validate order exists
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    // Check cache first
    const cached = this.nfeCache.get(orderId);
    if (cached) {
      return cached;
    }

    // Calculate tax
    const taxBreakdown = this.calculateTax(
      Number(order.totalBrl),
      'SP', // Default origin state — in production would come from seller profile
      'SP', // Default destination state — in production would come from buyer address
    );

    // Delegate to NF-e client
    const response = await this.nfeClient.generateNFe(
      {
        orderId,
        itemDescription: `Vintage.br - Pedido ${orderId}`,
        itemPriceBrl: Number(order.totalBrl),
        sellerCnpj: '', // Would come from seller profile
        buyerCpf: '', // Would come from buyer profile
        originState: 'SP',
        destinationState: 'SP',
      },
      {
        icms: taxBreakdown.icms,
        iss: taxBreakdown.iss,
        total: taxBreakdown.total,
      },
    );

    const nfe: NFeData = {
      nfeId: response.nfeId,
      orderId,
      accessKey: response.accessKey,
      xml: response.xml,
      pdfUrl: response.pdfUrl,
      status: response.status,
      issuedAt: new Date(response.issuedAt),
    };

    // Cache it
    this.nfeCache.set(orderId, nfe);
    this.logger.log(`NF-e generated for order ${orderId}: ${nfe.nfeId}`);

    return nfe;
  }

  async getNFe(orderId: string): Promise<NFeData> {
    // Check cache first
    const cached = this.nfeCache.get(orderId);
    if (cached) {
      return cached;
    }

    // If not cached, we have no NF-e for this order yet
    throw new NotFoundException('NF-e não encontrada para este pedido');
  }

  calculateTax(
    itemPriceBrl: number,
    originState: string,
    destinationState: string,
  ): TaxBreakdown {
    // Simple tax calculation logic
    // Intrastate: 18% ICMS, Interstate: 12% ICMS
    const isIntrastate =
      originState.toUpperCase() === destinationState.toUpperCase();
    const icmsRate = isIntrastate ? 0.18 : 0.12;
    const issRate = 0.05; // Fixed ISS rate for services

    const icms = Math.round(itemPriceBrl * icmsRate * 100) / 100;
    const iss = Math.round(itemPriceBrl * issRate * 100) / 100;
    const total = Math.round((icms + iss) * 100) / 100;
    const effectiveRate =
      Math.round(((icms + iss) / itemPriceBrl) * 10000) / 100;

    return { icms, iss, total, effectiveRate };
  }
}
