import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// TODO: Integrate with Enotas or NFe.io API for real NF-e generation

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
  // TODO: Replace in-memory store with proper NF-e persistence
  private nfeStore: Map<string, NFeData> = new Map();

  constructor(private prisma: PrismaService) {}

  async generateNFe(orderId: string): Promise<NFeData> {
    // Validate order exists
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    // Check if NF-e already exists for this order
    const existing = this.nfeStore.get(orderId);
    if (existing) {
      return existing;
    }

    // TODO: Integrate with Enotas or NFe.io API for real NF-e generation
    const accessKey = Array.from({ length: 44 }, () =>
      Math.floor(Math.random() * 10),
    ).join('');

    const nfe: NFeData = {
      nfeId: `NFe-${Date.now()}-${orderId.slice(0, 8)}`,
      orderId,
      accessKey,
      xml: `<mock><nfeProc><NFe><infNFe Id="NFe${accessKey}"><orderId>${orderId}</orderId></infNFe></NFe></nfeProc></mock>`,
      pdfUrl: `/nota-fiscal/${orderId}/pdf`,
      status: 'authorized',
      issuedAt: new Date(),
    };

    this.nfeStore.set(orderId, nfe);
    return nfe;
  }

  async getNFe(orderId: string): Promise<NFeData> {
    const nfe = this.nfeStore.get(orderId);
    if (!nfe) {
      throw new NotFoundException('NF-e não encontrada para este pedido');
    }
    return nfe;
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
