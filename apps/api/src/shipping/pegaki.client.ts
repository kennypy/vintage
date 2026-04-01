import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';

export interface PegakiDropoffPoint {
  name: string;
  address: string;
  city: string;
  state: string;
  cep: string;
  distanceKm: number;
  openingHours?: string;
}

export interface PegakiLabel {
  labelUrl: string;
  qrCodeData: string;
  qrCodeDataUrl: string;
  trackingCode: string;
  estimatedDelivery: string;
}

@Injectable()
export class PegakiClient {
  private readonly logger = new Logger(PegakiClient.name);
  private readonly apiUrl: string;
  private readonly apiKey: string | undefined;

  constructor(private config: ConfigService) {
    this.apiUrl = this.config.get<string>('PEGAKI_API_URL', 'https://api.pegaki.com.br/v1');
    this.apiKey = this.config.get<string>('PEGAKI_API_KEY');
  }

  async generateLabel(
    orderId: string,
    originAddress: string,
    destinationAddress: string,
    weightG: number,
  ): Promise<PegakiLabel> {
    if (!this.apiKey) {
      this.logger.warn('PEGAKI_API_KEY not configured, returning mock label');
      return this.mockLabel(orderId);
    }

    try {
      const body = JSON.stringify({
        reference: orderId,
        origin: originAddress,
        destination: destinationAddress,
        weight_kg: weightG / 1000,
      });

      const response = await fetch(`${this.apiUrl}/shipments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return this.mockLabel(orderId);

      const data = (await response.json()) as {
        label_url?: string;
        tracking_code?: string;
        estimated_delivery?: string;
      };

      const trackingCode = data.tracking_code ?? `PK${Date.now()}`;
      const qrCodeData = `https://app.pegaki.com.br/rastrear/${trackingCode}`;
      const qrCodeDataUrl = await QRCode.toDataURL(qrCodeData);

      return {
        labelUrl: data.label_url ?? '',
        qrCodeData,
        qrCodeDataUrl,
        trackingCode,
        estimatedDelivery: data.estimated_delivery ?? '4 dias úteis',
      };
    } catch (err) {
      this.logger.error(`Pegaki label generation failed: ${String(err).slice(0, 200)}`);
      return this.mockLabel(orderId);
    }
  }

  async findDropoffPoints(cep: string): Promise<PegakiDropoffPoint[]> {
    if (!this.apiKey) {
      return this.mockDropoffPoints(cep);
    }

    try {
      const response = await fetch(
        `${this.apiUrl}/points?cep=${cep.replace(/\D/g, '')}`,
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          signal: AbortSignal.timeout(8000),
        },
      );

      if (!response.ok) return this.mockDropoffPoints(cep);

      const data = (await response.json()) as Array<{
        name?: string;
        address?: string;
        city?: string;
        state?: string;
        postal_code?: string;
        distance_km?: number;
        opening_hours?: string;
      }>;

      return data.map((p) => ({
        name: p.name ?? 'Ponto Pegaki',
        address: p.address ?? '',
        city: p.city ?? '',
        state: p.state ?? '',
        cep: p.postal_code ?? '',
        distanceKm: p.distance_km ?? 0,
        openingHours: p.opening_hours,
      }));
    } catch (err) {
      this.logger.error(`Pegaki dropoff lookup failed: ${String(err).slice(0, 200)}`);
      return this.mockDropoffPoints(cep);
    }
  }

  private async mockLabel(orderId: string): Promise<PegakiLabel> {
    const trackingCode = `PK${Date.now()}`;
    const qrCodeData = `https://app.pegaki.com.br/rastrear/${trackingCode}`;
    const qrCodeDataUrl = await QRCode.toDataURL(qrCodeData);
    return {
      labelUrl: `https://vintage.br/labels/${orderId}-pegaki.pdf`,
      qrCodeData,
      qrCodeDataUrl,
      trackingCode,
      estimatedDelivery: '4 dias úteis',
    };
  }

  private mockDropoffPoints(_cep: string): PegakiDropoffPoint[] {
    return [
      {
        name: 'Padaria Central',
        address: 'Rua Augusta, 789',
        city: 'São Paulo',
        state: 'SP',
        cep: '01305-000',
        distanceKm: 0.8,
        openingHours: 'Seg-Dom 6h-22h',
      },
    ];
  }
}
