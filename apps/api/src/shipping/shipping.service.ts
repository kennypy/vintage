import { Injectable, Logger } from '@nestjs/common';
import { CorreiosClient } from './correios.client';
import { JadlogClient } from './jadlog.client';

export interface ShippingOption {
  carrier: string;
  serviceName: string;
  priceBrl: number;
  estimatedDays: string;
  trackingAvailable: boolean;
}

export interface ShippingLabel {
  labelUrl: string;
  trackingCode: string;
  carrier: string;
  estimatedDelivery: string;
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
  ) {}

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

    const [correiosRates, jadlogRates] = await Promise.all([
      this.correios
        .calculateRates(originCep, destinationCep, weightG, dimensions)
        .catch((err) => {
          this.logger.error(
            `Correios rate calculation failed: ${String(err).slice(0, 200)}`,
          );
          return [];
        }),
      this.jadlog
        .calculateRates(originCep, destinationCep, weightG)
        .catch((err) => {
          this.logger.error(
            `Jadlog rate calculation failed: ${String(err).slice(0, 200)}`,
          );
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
      });
    }

    for (const rate of jadlogRates) {
      options.push({
        carrier: 'Jadlog',
        serviceName: rate.serviceName,
        priceBrl: rate.priceBrl,
        estimatedDays: `${rate.estimatedDays} dias úteis`,
        trackingAvailable: true,
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
  ): Promise<ShippingLabel> {
    const normalizedCarrier = carrier.toLowerCase();

    if (normalizedCarrier === 'jadlog') {
      const label = await this.jadlog.generateLabel(
        orderId,
        originAddress,
        destinationAddress,
        weightG,
      );
      return {
        labelUrl: label.labelUrl,
        trackingCode: label.trackingCode,
        carrier: 'Jadlog',
        estimatedDelivery: label.estimatedDelivery,
      };
    }

    // Default to Correios
    const label = await this.correios.generateLabel(
      orderId,
      originAddress,
      destinationAddress,
      weightG,
    );
    return {
      labelUrl: label.labelUrl,
      trackingCode: label.trackingCode,
      carrier: 'Correios',
      estimatedDelivery: label.estimatedDelivery,
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
  getDropoffPoints(_cep: string, carrier?: string): DropoffPoint[] {
    // TODO: Integrate with Correios agency locator and Jadlog partner points API
    const allPoints: DropoffPoint[] = [
      {
        name: 'Agência Correios Centro',
        address: 'Rua XV de Novembro, 100',
        city: 'São Paulo',
        state: 'SP',
        cep: '01010-000',
        carrier: 'Correios',
        distanceKm: 0.8,
      },
      {
        name: 'Agência Correios Vila Mariana',
        address: 'Rua Domingos de Morais, 500',
        city: 'São Paulo',
        state: 'SP',
        cep: '04010-000',
        carrier: 'Correios',
        distanceKm: 2.3,
      },
      {
        name: 'Jadlog Filial São Paulo',
        address: 'Av. Paulista, 1500',
        city: 'São Paulo',
        state: 'SP',
        cep: '01310-000',
        carrier: 'Jadlog',
        distanceKm: 1.5,
      },
      {
        name: 'Jadlog Ponto Parceiro - Papelaria Express',
        address: 'Rua Augusta, 800',
        city: 'São Paulo',
        state: 'SP',
        cep: '01304-000',
        carrier: 'Jadlog',
        distanceKm: 3.1,
      },
    ];

    if (carrier) {
      return allPoints.filter(
        (p) => p.carrier.toLowerCase() === carrier.toLowerCase(),
      );
    }

    return allPoints;
  }
}
