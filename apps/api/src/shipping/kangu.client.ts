import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';

export interface KanguRate {
  serviceName: string;
  priceBrl: number;
  estimatedDays: number;
}

export interface KanguLabel {
  labelUrl: string;       // PDF label URL (may be null if printer-free mode)
  qrCodeData: string;     // QR code content string for printer-free drop-off
  qrCodeDataUrl: string;  // Base64 data URL of QR code image
  trackingCode: string;
  estimatedDelivery: string;
}

export interface KanguDropoffPoint {
  name: string;
  address: string;
  city: string;
  state: string;
  cep: string;
  distanceKm: number;
  openingHours?: string;
}

@Injectable()
export class KanguClient {
  private readonly logger = new Logger(KanguClient.name);
  private readonly apiUrl: string;
  private readonly apiKey: string | undefined;

  constructor(private config: ConfigService) {
    this.apiUrl = this.config.get<string>('KANGU_API_URL', 'https://portal.kangu.com.br/tms/transporte');
    this.apiKey = this.config.get<string>('KANGU_API_KEY');
  }

  async calculateRates(
    originCep: string,
    destinationCep: string,
    weightG: number,
  ): Promise<KanguRate[]> {
    if (!this.apiKey) {
      this.logger.warn('KANGU_API_KEY not configured, returning mock rates');
      return this.mockRates();
    }

    try {
      const body = JSON.stringify({
        cepOrigem: originCep.replace(/\D/g, ''),
        cepDestino: destinationCep.replace(/\D/g, ''),
        vlrMerc: 50, // mock declared value for rate calculation
        tpEnvio: 'P', // Package
        pesoReal: weightG / 1000,
        produtos: [{ peso: weightG / 1000, altura: 10, largura: 15, comprimento: 20, quantidade: 1 }],
      });

      const response = await fetch(`${this.apiUrl}/simular`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          token: this.apiKey,
        },
        body,
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        this.logger.error(`Kangu API error: ${response.status}`);
        return this.mockRates();
      }

      const data = (await response.json()) as Array<{
        nomeTransp?: string;
        vlrFrete?: number;
        prazoEnt?: number;
      }>;

      return data.map((item) => ({
        serviceName: item.nomeTransp ?? 'Kangu',
        priceBrl: item.vlrFrete ?? 18.9,
        estimatedDays: item.prazoEnt ?? 5,
      }));
    } catch (err) {
      this.logger.error(`Kangu rate calculation failed: ${String(err).slice(0, 200)}`);
      return this.mockRates();
    }
  }

  async generateLabel(
    orderId: string,
    originAddress: string,
    destinationAddress: string,
    weightG: number,
  ): Promise<KanguLabel> {
    if (!this.apiKey) {
      this.logger.warn('KANGU_API_KEY not configured, returning mock label');
      return this.mockLabel(orderId);
    }

    try {
      const body = JSON.stringify({
        referencia: orderId,
        enderecoOrigem: originAddress,
        enderecoDestino: destinationAddress,
        peso: weightG / 1000,
      });

      const response = await fetch(`${this.apiUrl}/solicitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: this.apiKey },
        body,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return this.mockLabel(orderId);
      }

      const data = (await response.json()) as {
        linkEtiqueta?: string;
        colicha?: string;
        previsaoEntrega?: string;
      };

      const trackingCode = data.colicha ?? `KG${Date.now()}`;
      const qrCodeData = `https://portal.kangu.com.br/rastreio/${trackingCode}`;
      const qrCodeDataUrl = await QRCode.toDataURL(qrCodeData);

      return {
        labelUrl: data.linkEtiqueta ?? '',
        qrCodeData,
        qrCodeDataUrl,
        trackingCode,
        estimatedDelivery: data.previsaoEntrega ?? '5 dias úteis',
      };
    } catch (err) {
      this.logger.error(`Kangu label generation failed: ${String(err).slice(0, 200)}`);
      return this.mockLabel(orderId);
    }
  }

  async findDropoffPoints(cep: string): Promise<KanguDropoffPoint[]> {
    if (!this.apiKey) {
      return this.mockDropoffPoints(cep);
    }

    try {
      const response = await fetch(
        `${this.apiUrl}/pontosde?cep=${cep.replace(/\D/g, '')}`,
        {
          headers: { token: this.apiKey },
          signal: AbortSignal.timeout(8000),
        },
      );

      if (!response.ok) return this.mockDropoffPoints(cep);

      const data = (await response.json()) as Array<{
        nomeFantasia?: string;
        logradouro?: string;
        cidade?: string;
        uf?: string;
        cep?: string;
        distancia?: number;
        horario?: string;
      }>;

      return data.map((p) => ({
        name: p.nomeFantasia ?? 'Ponto Kangu',
        address: p.logradouro ?? '',
        city: p.cidade ?? '',
        state: p.uf ?? '',
        cep: p.cep ?? '',
        distanceKm: p.distancia ?? 0,
        openingHours: p.horario,
      }));
    } catch (err) {
      this.logger.error(`Kangu dropoff lookup failed: ${String(err).slice(0, 200)}`);
      return this.mockDropoffPoints(cep);
    }
  }

  private mockRates(): KanguRate[] {
    return [{ serviceName: 'Kangu .Pacote', priceBrl: 16.9, estimatedDays: 5 }];
  }

  private async mockLabel(orderId: string): Promise<KanguLabel> {
    const trackingCode = `KG${Date.now()}`;
    const qrCodeData = `https://portal.kangu.com.br/rastreio/${trackingCode}`;
    const qrCodeDataUrl = await QRCode.toDataURL(qrCodeData);
    return {
      labelUrl: `https://vintage.br/labels/${orderId}-kangu.pdf`,
      qrCodeData,
      qrCodeDataUrl,
      trackingCode,
      estimatedDelivery: '5 dias úteis',
    };
  }

  private mockDropoffPoints(_cep: string): KanguDropoffPoint[] {
    return [
      {
        name: 'Mercado do Bairro',
        address: 'Rua das Flores, 123',
        city: 'São Paulo',
        state: 'SP',
        cep: '01310-100',
        distanceKm: 0.5,
        openingHours: 'Seg-Sáb 8h-20h',
      },
      {
        name: 'Farmácia Popular',
        address: 'Av. Paulista, 456',
        city: 'São Paulo',
        state: 'SP',
        cep: '01310-200',
        distanceKm: 1.2,
        openingHours: '24 horas',
      },
    ];
  }
}
