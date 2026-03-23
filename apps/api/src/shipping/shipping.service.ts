import { Injectable } from '@nestjs/common';

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
  // TODO: Replace with real Correios API (sigepweb) and Jadlog API integration

  /**
   * Calcula fretes disponíveis com base no CEP de origem/destino e peso.
   */
  calculateRates(
    _originCep: string,
    _destinationCep: string,
    weightG: number,
    _length?: number,
    _width?: number,
    _height?: number,
  ): ShippingOption[] {
    const baseRateMin = 15;
    const baseRateMax = 25;
    const perGramRate = 0.01;

    const baseCorreiosPac =
      baseRateMin + Math.random() * (baseRateMax - baseRateMin);
    const baseCorreiosSedex =
      baseRateMax + Math.random() * (baseRateMax - baseRateMin);
    const baseJadlog =
      (baseRateMin + baseRateMax) / 2 + Math.random() * (baseRateMax - baseRateMin);

    const weightCost = weightG * perGramRate;

    return [
      {
        carrier: 'Correios',
        serviceName: 'PAC',
        priceBrl: Math.round((baseCorreiosPac + weightCost) * 100) / 100,
        estimatedDays: '5-10 dias úteis',
        trackingAvailable: true,
      },
      {
        carrier: 'Correios',
        serviceName: 'SEDEX',
        priceBrl: Math.round((baseCorreiosSedex + weightCost) * 100) / 100,
        estimatedDays: '1-3 dias úteis',
        trackingAvailable: true,
      },
      {
        carrier: 'Jadlog',
        serviceName: '.Package',
        priceBrl: Math.round((baseJadlog + weightCost) * 100) / 100,
        estimatedDays: '3-7 dias úteis',
        trackingAvailable: true,
      },
    ];
  }

  /**
   * Gera etiqueta de envio para o pedido.
   */
  generateShippingLabel(
    orderId: string,
    carrier: string,
    _originAddress: string,
    _destinationAddress: string,
    _weightG: number,
  ): ShippingLabel {
    // TODO: Call Correios SIGEP Web API or Jadlog API to generate real label
    const trackingCode = 'BR' + this.generateRandomAlphanumeric(11);
    const estimatedDelivery = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    return {
      labelUrl: `https://vintage.br/labels/${orderId}-${carrier.toLowerCase()}.pdf`,
      trackingCode,
      carrier,
      estimatedDelivery,
    };
  }

  /**
   * Consulta status de rastreamento de um envio.
   */
  getTrackingStatus(_trackingCode: string): TrackingEvent[] {
    // TODO: Poll Correios SRO API or Jadlog tracking API
    const now = new Date();

    return [
      {
        status: 'POSTED',
        location: 'São Paulo, SP',
        timestamp: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        description: 'Objeto postado',
      },
      {
        status: 'IN_TRANSIT',
        location: 'Curitiba, PR',
        timestamp: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        description: 'Em trânsito',
      },
      {
        status: 'OUT_FOR_DELIVERY',
        location: 'Curitiba, PR',
        timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        description: 'Saiu para entrega',
      },
    ];
  }

  /**
   * Retorna pontos de coleta/entrega próximos ao CEP informado.
   */
  getDropoffPoints(cep: string, carrier?: string): DropoffPoint[] {
    // TODO: Use Correios agency locator API
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

  private generateRandomAlphanumeric(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
