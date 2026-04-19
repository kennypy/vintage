import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { CorreiosClient } from './correios.client';
import { JadlogClient } from './jadlog.client';
import { KanguClient } from './kangu.client';
import { PegakiClient } from './pegaki.client';
import { PrismaService } from '../prisma/prisma.service';

export interface ShippingOption {
  carrier: string;
  serviceName: string;
  priceBrl: number;
  estimatedDays: string;
  trackingAvailable: boolean;
  supportsPrinterFree: boolean; // True for Kangu, Pegaki, JadLog
}

export interface ShippingLabel {
  labelUrl: string;
  trackingCode: string;
  carrier: string;
  estimatedDelivery: string;
  qrCodeData?: string;     // QR code content string (for printer-free drop-off)
  qrCodeDataUrl?: string;  // Base64 PNG data URL of QR code image
}

export interface TrackingEvent {
  status: string;
  location: string;
  timestamp: string;
  description: string;
}

export interface DropoffPoint {
  name: string;
  address: string;
  city: string;
  state: string;
  cep: string;
  carrier: string;
  distanceKm: number;
}

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly correios: CorreiosClient,
    private readonly jadlog: JadlogClient,
    private readonly kangu: KanguClient,
    private readonly pegaki: PegakiClient,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Ownership gate for generateShippingLabel. The previous controller
   * accepted an orderId and a userId-less service call, which meant any
   * authenticated user could generate — and pay for — a shipping label
   * for any order they knew the id of. Resolve the order and refuse
   * unless the caller is its seller.
   */
  private async assertSellerOfOrder(orderId: string, userId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { sellerId: true },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }
    if (order.sellerId !== userId) {
      throw new ForbiddenException('Você não é o vendedor deste pedido.');
    }
  }

  /**
   * Calcula fretes disponíveis com base no CEP de origem/destino e peso.
   */
  async calculateRates(
    originCep: string,
    destinationCep: string,
    weightG: number,
    length?: number,
    width?: number,
    height?: number,
  ): Promise<ShippingOption[]> {
    const dimensions =
      length && width && height ? { length, width, height } : undefined;

    const [correiosRates, jadlogRates, kanguRates] = await Promise.all([
      this.correios
        .calculateRates(originCep, destinationCep, weightG, dimensions)
        .catch((err) => {
          this.logger.error(`Correios rate calculation failed: ${String(err).slice(0, 200)}`);
          return [];
        }),
      this.jadlog
        .calculateRates(originCep, destinationCep, weightG)
        .catch((err) => {
          this.logger.error(`Jadlog rate calculation failed: ${String(err).slice(0, 200)}`);
          return [];
        }),
      this.kangu
        .calculateRates(originCep, destinationCep, weightG)
        .catch((err) => {
          this.logger.error(`Kangu rate calculation failed: ${String(err).slice(0, 200)}`);
          return [];
        }),
    ]);

    const options: ShippingOption[] = [];

    for (const rate of correiosRates) {
      options.push({
        carrier: 'Correios',
        serviceName: rate.serviceName,
        priceBrl: rate.priceBrl,
        estimatedDays: `${rate.estimatedDays} dias úteis`,
        trackingAvailable: true,
        supportsPrinterFree: false,
      });
    }

    for (const rate of jadlogRates) {
      options.push({
        carrier: 'Jadlog',
        serviceName: rate.serviceName,
        priceBrl: rate.priceBrl,
        estimatedDays: `${rate.estimatedDays} dias úteis`,
        trackingAvailable: true,
        supportsPrinterFree: true, // JadLog supports QR drop-off
      });
    }

    for (const rate of kanguRates) {
      options.push({
        carrier: 'Kangu',
        serviceName: rate.serviceName,
        priceBrl: rate.priceBrl,
        estimatedDays: `${rate.estimatedDays} dias úteis`,
        trackingAvailable: true,
        supportsPrinterFree: true, // Kangu is printer-free native
      });
    }

    return options;
  }

  /**
   * Gera etiqueta de envio para o pedido.
   */
  async generateShippingLabel(
    orderId: string,
    carrier: string,
    originAddress: string,
    destinationAddress: string,
    weightG: number,
    userId: string,
  ): Promise<ShippingLabel> {
    await this.assertSellerOfOrder(orderId, userId);
    const normalizedCarrier = carrier.toLowerCase();

    if (normalizedCarrier === 'jadlog') {
      const label = await this.jadlog.generateLabel(orderId, originAddress, destinationAddress, weightG);
      // Generate QR code for printer-free drop-off
      const qrCodeData = `https://melhorrastreio.com.br/rastreio/${label.trackingCode}`;
      const qrCodeDataUrl = await QRCode.toDataURL(qrCodeData).catch(() => undefined);
      return {
        labelUrl: label.labelUrl,
        trackingCode: label.trackingCode,
        carrier: 'Jadlog',
        estimatedDelivery: label.estimatedDelivery,
        qrCodeData,
        qrCodeDataUrl,
      };
    }

    if (normalizedCarrier === 'kangu') {
      const label = await this.kangu.generateLabel(orderId, originAddress, destinationAddress, weightG);
      return {
        labelUrl: label.labelUrl,
        trackingCode: label.trackingCode,
        carrier: 'Kangu',
        estimatedDelivery: label.estimatedDelivery,
        qrCodeData: label.qrCodeData,
        qrCodeDataUrl: label.qrCodeDataUrl,
      };
    }

    if (normalizedCarrier === 'pegaki') {
      const label = await this.pegaki.generateLabel(orderId, originAddress, destinationAddress, weightG);
      return {
        labelUrl: label.labelUrl,
        trackingCode: label.trackingCode,
        carrier: 'Pegaki',
        estimatedDelivery: label.estimatedDelivery,
        qrCodeData: label.qrCodeData,
        qrCodeDataUrl: label.qrCodeDataUrl,
      };
    }

    // Default to Correios
    const label = await this.correios.generateLabel(orderId, originAddress, destinationAddress, weightG);
    const qrCodeData = `https://rastreamento.correios.com.br/app/index.php/cores/${label.trackingCode}`;
    const qrCodeDataUrl = await QRCode.toDataURL(qrCodeData).catch(() => undefined);
    return {
      labelUrl: label.labelUrl,
      trackingCode: label.trackingCode,
      carrier: 'Correios',
      estimatedDelivery: label.estimatedDelivery,
      qrCodeData,
      qrCodeDataUrl,
    };
  }

  /**
   * Consulta status de rastreamento de um envio.
   */
  async getTrackingStatus(trackingCode: string): Promise<TrackingEvent[]> {
    // Determine carrier from tracking code prefix
    if (trackingCode.startsWith('JD')) {
      return this.jadlog.getTracking(trackingCode);
    }

    // Default to Correios
    return this.correios.getTracking(trackingCode);
  }

  /**
   * Retorna pontos de coleta/entrega próximos ao CEP informado.
   */
  async getDropoffPoints(cep: string, carrier?: string): Promise<DropoffPoint[]> {
    const normalizedCarrier = carrier?.toLowerCase();
    const allCarriers = !normalizedCarrier;

    const [correiosPoints, jadlogPoints, kanguPoints, pegakiPoints] = await Promise.all([
      allCarriers || normalizedCarrier === 'correios'
        ? this.correios.findAgencies(cep).catch((err) => {
            this.logger.error(`Correios agency lookup failed: ${String(err).slice(0, 200)}`);
            return [];
          })
        : Promise.resolve([]),
      allCarriers || normalizedCarrier === 'jadlog'
        ? this.jadlog.findPartnerPoints(cep).catch((err) => {
            this.logger.error(`Jadlog partner point lookup failed: ${String(err).slice(0, 200)}`);
            return [];
          })
        : Promise.resolve([]),
      allCarriers || normalizedCarrier === 'kangu'
        ? this.kangu.findDropoffPoints(cep).catch((err) => {
            this.logger.error(`Kangu dropoff lookup failed: ${String(err).slice(0, 200)}`);
            return [];
          })
        : Promise.resolve([]),
      allCarriers || normalizedCarrier === 'pegaki'
        ? this.pegaki.findDropoffPoints(cep).catch((err) => {
            this.logger.error(`Pegaki dropoff lookup failed: ${String(err).slice(0, 200)}`);
            return [];
          })
        : Promise.resolve([]),
    ]);

    const points: DropoffPoint[] = [
      ...correiosPoints.map((p) => ({ ...p, carrier: 'Correios' as const })),
      ...jadlogPoints.map((p) => ({ ...p, carrier: 'Jadlog' as const })),
      ...kanguPoints.map((p) => ({ ...p, carrier: 'Kangu' as const })),
      ...pegakiPoints.map((p) => ({ ...p, carrier: 'Pegaki' as const })),
    ];

    return points.sort((a, b) => a.distanceKm - b.distanceKm);
  }
}
