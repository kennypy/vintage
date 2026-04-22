import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

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

  /**
   * Find Correios agency drop-off points near a given CEP.
   */
  async findAgencies(cep: string): Promise<
    Array<{
      name: string;
      address: string;
      city: string;
      state: string;
      cep: string;
      distanceKm: number;
    }>
  > {
    if (!this.isConfigured) {
      return this.mockAgencies(cep);
    }

    const result = await this.request<{
      agencias: Array<{
        nome: string;
        logradouro: string;
        municipio: string;
        uf: string;
        cep: string;
        distancia: number;
      }>;
    }>('GET', `/agencias/v1/agencias?cep=${cep.replace(/\D/g, '')}`);

    return result.agencias.map((a) => ({
      name: a.nome,
      address: a.logradouro,
      city: a.municipio,
      state: a.uf,
      cep: a.cep,
      distanceKm: a.distancia,
    }));
  }

  // --------------- Mock implementations ---------------

  private mockAgencies(
    _cep: string,
  ): Array<{
    name: string;
    address: string;
    city: string;
    state: string;
    cep: string;
    distanceKm: number;
  }> {
    this.logger.warn('Using mock Correios agencies (CORREIOS_TOKEN not set)');
    return [
      {
        name: 'Agência Correios Centro',
        address: 'Rua XV de Novembro, 100',
        city: 'São Paulo',
        state: 'SP',
        cep: '01010-000',
        distanceKm: 0.8,
      },
      {
        name: 'Agência Correios Vila Mariana',
        address: 'Rua Domingos de Morais, 500',
        city: 'São Paulo',
        state: 'SP',
        cep: '04010-000',
        distanceKm: 2.3,
      },
    ];
  }

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
    // CLAUDE.md §Secret Management bans non-cryptographic RNG for any
    // token generation. Even though this is a dev-only mock, keep the
    // pattern correct so it isn't copied into a prod codepath.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const trackingCode =
      'BR' + Array.from(randomBytes(11)).map((b) => alphabet[b % 36]).join('');
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
