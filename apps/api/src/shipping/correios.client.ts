import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CorreiosRate {
  serviceCode: string;
  serviceName: string;
  priceBrl: number;
  estimatedDays: number;
}

export interface CorreiosLabel {
  labelUrl: string;
  trackingCode: string;
  estimatedDelivery: string;
}

export interface CorreiosTrackingEvent {
  status: string;
  location: string;
  timestamp: string;
  description: string;
}

@Injectable()
export class CorreiosClient {
  private readonly logger = new Logger(CorreiosClient.name);
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.token = this.configService.get<string>('CORREIOS_TOKEN', '');
    this.baseUrl = this.configService.get<string>(
      'CORREIOS_API_URL',
      'https://api.correios.com.br',
    );
  }

  private get isConfigured(): boolean {
    return this.token.length > 0;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    this.logger.debug(`${method} ${path}`);

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = String(await response.text()).slice(0, 200);
      this.logger.error(
        `Correios API error: ${response.status} - ${errorText}`,
      );
      throw new Error(
        `Correios API error: ${response.status} - ${errorText}`,
      );
    }

    return (await response.json()) as T;
  }

  /**
   * Calculate PAC and SEDEX rates via Correios API.
   */
  async calculateRates(
    originCep: string,
    destinationCep: string,
    weightG: number,
    dimensions?: { length: number; width: number; height: number },
  ): Promise<CorreiosRate[]> {
    if (!this.isConfigured) {
      return this.mockRates(weightG);
    }

    const dims = dimensions ?? { length: 20, width: 15, height: 10 };
    const result = await this.request<{
      services: Array<{
        code: string;
        name: string;
        price: number;
        deliveryTime: number;
      }>;
    }>('POST', '/preco/v1/nacional', {
      cepOrigem: originCep.replace(/\D/g, ''),
      cepDestino: destinationCep.replace(/\D/g, ''),
      pesoEmGramas: weightG,
      comprimento: dims.length,
      largura: dims.width,
      altura: dims.height,
      servicosCodigos: ['04510', '04014'], // PAC, SEDEX
    });

    return result.services.map((s) => ({
      serviceCode: s.code,
      serviceName: s.name,
      priceBrl: s.price,
      estimatedDays: s.deliveryTime,
    }));
  }

  /**
   * Generate shipping label via Correios SIGEP Web.
   */
  async generateLabel(
    orderId: string,
    originAddress: string,
    destinationAddress: string,
    weightG: number,
  ): Promise<CorreiosLabel> {
    if (!this.isConfigured) {
      return this.mockLabel(orderId);
    }

    const result = await this.request<{
      trackingCode: string;
      labelUrl: string;
      estimatedDelivery: string;
    }>('POST', '/sigepweb/v1/etiquetas', {
      orderId,
      originAddress,
      destinationAddress,
      weightG,
    });

    return {
      labelUrl: result.labelUrl,
      trackingCode: result.trackingCode,
      estimatedDelivery: result.estimatedDelivery,
    };
  }

  /**
   * Get tracking events via Correios SRO API.
   */
  async getTracking(code: string): Promise<CorreiosTrackingEvent[]> {
    if (!this.isConfigured) {
      return this.mockTracking();
    }

    const result = await this.request<{
      events: Array<{
        type: string;
        city: string;
        state: string;
        date: string;
        description: string;
      }>;
    }>('GET', `/sro/v1/objetos/${encodeURIComponent(code)}`);

    return result.events.map((e) => ({
      status: e.type,
      location: `${e.city}, ${e.state}`,
      timestamp: e.date,
      description: e.description,
    }));
  }

  // --------------- Mock implementations ---------------

  private mockRates(weightG: number): CorreiosRate[] {
    this.logger.warn('Using mock Correios rates (CORREIOS_TOKEN not set)');
    const weightCost = weightG * 0.01;
    return [
      {
        serviceCode: '04510',
        serviceName: 'PAC',
        priceBrl: Math.round((18 + weightCost) * 100) / 100,
        estimatedDays: 8,
      },
      {
        serviceCode: '04014',
        serviceName: 'SEDEX',
        priceBrl: Math.round((28 + weightCost) * 100) / 100,
        estimatedDays: 2,
      },
    ];
  }

  private mockLabel(orderId: string): CorreiosLabel {
    this.logger.warn('Using mock Correios label (CORREIOS_TOKEN not set)');
    const trackingCode =
      'BR' + Array.from({ length: 11 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');
    return {
      labelUrl: `https://vintage.br/labels/${orderId}-correios.pdf`,
      trackingCode,
      estimatedDelivery: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    };
  }

  private mockTracking(): CorreiosTrackingEvent[] {
    this.logger.warn('Using mock Correios tracking (CORREIOS_TOKEN not set)');
    const now = new Date();
    return [
      {
        status: 'POSTED',
        location: 'São Paulo, SP',
        timestamp: new Date(
          now.getTime() - 5 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        description: 'Objeto postado',
      },
      {
        status: 'IN_TRANSIT',
        location: 'Curitiba, PR',
        timestamp: new Date(
          now.getTime() - 3 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        description: 'Em trânsito',
      },
      {
        status: 'OUT_FOR_DELIVERY',
        location: 'Curitiba, PR',
        timestamp: new Date(
          now.getTime() - 1 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        description: 'Saiu para entrega',
      },
    ];
  }
}
