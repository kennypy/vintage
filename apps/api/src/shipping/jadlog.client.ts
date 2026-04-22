import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

export interface JadlogRate {
  serviceCode: string;
  serviceName: string;
  priceBrl: number;
  estimatedDays: number;
}

export interface JadlogLabel {
  labelUrl: string;
  trackingCode: string;
  estimatedDelivery: string;
}

export interface JadlogTrackingEvent {
  status: string;
  location: string;
  timestamp: string;
  description: string;
}

@Injectable()
export class JadlogClient {
  private readonly logger = new Logger(JadlogClient.name);
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.token = this.configService.get<string>('JADLOG_TOKEN', '');
    this.baseUrl = this.configService.get<string>(
      'JADLOG_API_URL',
      'https://www.jadlog.com.br/api',
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
        `Jadlog API error: ${response.status} - ${errorText}`,
      );
      throw new Error(
        `Jadlog API error: ${response.status} - ${errorText}`,
      );
    }

    return (await response.json()) as T;
  }

  /**
   * Calculate Jadlog .Package rates.
   */
  async calculateRates(
    originCep: string,
    destinationCep: string,
    weightG: number,
  ): Promise<JadlogRate[]> {
    if (!this.isConfigured) {
      return this.mockRates(weightG);
    }

    const result = await this.request<{
      frete: Array<{
        modalidade: string;
        valor: number;
        prazo: number;
      }>;
    }>('POST', '/frete/simulacao', {
      cepOrigem: originCep.replace(/\D/g, ''),
      cepDestino: destinationCep.replace(/\D/g, ''),
      peso: weightG / 1000, // Jadlog uses kg
      modalidade: 3, // .Package
    });

    return result.frete.map((f) => ({
      serviceCode: String(f.modalidade),
      serviceName: `.Package`,
      priceBrl: f.valor,
      estimatedDays: f.prazo,
    }));
  }

  /**
   * Generate Jadlog shipping label.
   */
  async generateLabel(
    orderId: string,
    originAddress: string,
    destinationAddress: string,
    weightG: number,
  ): Promise<JadlogLabel> {
    if (!this.isConfigured) {
      return this.mockLabel(orderId);
    }

    const result = await this.request<{
      trackingCode: string;
      labelUrl: string;
      estimatedDelivery: string;
    }>('POST', '/pedido/incluir', {
      orderId,
      originAddress,
      destinationAddress,
      peso: weightG / 1000,
    });

    return {
      labelUrl: result.labelUrl,
      trackingCode: result.trackingCode,
      estimatedDelivery: result.estimatedDelivery,
    };
  }

  /**
   * Get tracking events from Jadlog.
   */
  async getTracking(code: string): Promise<JadlogTrackingEvent[]> {
    if (!this.isConfigured) {
      return this.mockTracking();
    }

    const result = await this.request<{
      eventos: Array<{
        status: string;
        cidade: string;
        uf: string;
        data: string;
        descricao: string;
      }>;
    }>('GET', `/tracking/consultar/${encodeURIComponent(code)}`);

    return result.eventos.map((e) => ({
      status: e.status,
      location: `${e.cidade}, ${e.uf}`,
      timestamp: e.data,
      description: e.descricao,
    }));
  }

  /**
   * Find Jadlog partner drop-off points near a given CEP.
   */
  async findPartnerPoints(cep: string): Promise<
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
      return this.mockPartnerPoints(cep);
    }

    const result = await this.request<{
      pontos: Array<{
        nome: string;
        endereco: string;
        cidade: string;
        uf: string;
        cep: string;
        distancia: number;
      }>;
    }>('GET', `/parceiro/pontos?cep=${cep.replace(/\D/g, '')}`);

    return result.pontos.map((p) => ({
      name: p.nome,
      address: p.endereco,
      city: p.cidade,
      state: p.uf,
      cep: p.cep,
      distanceKm: p.distancia,
    }));
  }

  // --------------- Mock implementations ---------------

  private mockPartnerPoints(
    _cep: string,
  ): Array<{
    name: string;
    address: string;
    city: string;
    state: string;
    cep: string;
    distanceKm: number;
  }> {
    this.logger.warn('Using mock Jadlog partner points (JADLOG_TOKEN not set)');
    return [
      {
        name: 'Jadlog Filial São Paulo',
        address: 'Av. Paulista, 1500',
        city: 'São Paulo',
        state: 'SP',
        cep: '01310-000',
        distanceKm: 1.5,
      },
      {
        name: 'Jadlog Ponto Parceiro - Papelaria Express',
        address: 'Rua Augusta, 800',
        city: 'São Paulo',
        state: 'SP',
        cep: '01304-000',
        distanceKm: 3.1,
      },
    ];
  }

  private mockRates(weightG: number): JadlogRate[] {
    this.logger.warn('Using mock Jadlog rates (JADLOG_TOKEN not set)');
    const weightCost = weightG * 0.01;
    return [
      {
        serviceCode: '3',
        serviceName: '.Package',
        priceBrl: Math.round((22 + weightCost) * 100) / 100,
        estimatedDays: 5,
      },
    ];
  }

  private mockLabel(orderId: string): JadlogLabel {
    this.logger.warn('Using mock Jadlog label (JADLOG_TOKEN not set)');
    // CLAUDE.md §Secret Management bans non-cryptographic RNG for any
    // token generation — keep the mock aligned with the pattern.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const trackingCode =
      'JD' + Array.from(randomBytes(11)).map((b) => alphabet[b % 36]).join('');
    return {
      labelUrl: `https://vintage.br/labels/${orderId}-jadlog.pdf`,
      trackingCode,
      estimatedDelivery: new Date(
        Date.now() + 5 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    };
  }

  private mockTracking(): JadlogTrackingEvent[] {
    this.logger.warn('Using mock Jadlog tracking (JADLOG_TOKEN not set)');
    const now = new Date();
    return [
      {
        status: 'COLETADO',
        location: 'São Paulo, SP',
        timestamp: new Date(
          now.getTime() - 4 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        description: 'Objeto coletado',
      },
      {
        status: 'EM_TRANSITO',
        location: 'Rio de Janeiro, RJ',
        timestamp: new Date(
          now.getTime() - 2 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        description: 'Em trânsito',
      },
    ];
  }
}
