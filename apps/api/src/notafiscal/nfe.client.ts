import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NFeResponse {
  nfeId: string;
  accessKey: string;
  xml: string;
  pdfUrl: string;
  status: 'authorized' | 'pending' | 'rejected';
  issuedAt: string;
}

export interface NFeOrderData {
  orderId: string;
  itemDescription: string;
  itemPriceBrl: number;
  sellerCnpj: string;
  buyerCpf: string;
  originState: string;
  destinationState: string;
}

export interface NFeTaxInfo {
  icms: number;
  iss: number;
  total: number;
}

@Injectable()
export class NFeClient {
  private readonly logger = new Logger(NFeClient.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly nodeEnv: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('NFE_API_KEY', '');
    this.baseUrl = this.configService.get<string>(
      'NFE_API_URL',
      'https://api.enotas.com.br/v2',
    );
    this.nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
  }

  private get isConfigured(): boolean {
    return this.apiKey.length > 0;
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
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = String(await response.text()).slice(0, 200);
      this.logger.error(
        `NF-e API error: ${response.status} - ${errorText}`,
      );
      throw new Error(
        `NF-e API error: ${response.status} - ${errorText}`,
      );
    }

    return (await response.json()) as T;
  }

  /**
   * Generate NF-e via Enotas/NFe.io API.
   */
  async generateNFe(
    orderData: NFeOrderData,
    taxInfo: NFeTaxInfo,
  ): Promise<NFeResponse> {
    if (!this.isConfigured) {
      if (this.nodeEnv === 'production') {
        throw new Error('NF-e service not configured — cannot operate in production');
      }
      return this.mockGenerateNFe(orderData);
    }

    const result = await this.request<{
      id: string;
      chaveAcesso: string;
      xml: string;
      linkDanfe: string;
      status: string;
      dataEmissao: string;
    }>('POST', '/nfe', {
      pedidoId: orderData.orderId,
      descricao: orderData.itemDescription,
      valor: orderData.itemPriceBrl,
      cnpjEmitente: orderData.sellerCnpj,
      cpfDestinatario: orderData.buyerCpf,
      impostos: {
        icms: taxInfo.icms,
        iss: taxInfo.iss,
        total: taxInfo.total,
      },
    });

    return {
      nfeId: result.id,
      accessKey: result.chaveAcesso,
      xml: result.xml,
      pdfUrl: result.linkDanfe,
      status: this.mapStatus(result.status),
      issuedAt: result.dataEmissao,
    };
  }

  /**
   * Retrieve existing NF-e by ID.
   */
  async getNFe(nfeId: string): Promise<NFeResponse> {
    if (!this.isConfigured) {
      if (this.nodeEnv === 'production') {
        throw new Error('NF-e service not configured — cannot operate in production');
      }
      return this.mockGetNFe(nfeId);
    }

    const result = await this.request<{
      id: string;
      chaveAcesso: string;
      xml: string;
      linkDanfe: string;
      status: string;
      dataEmissao: string;
    }>('GET', `/nfe/${encodeURIComponent(nfeId)}`);

    return {
      nfeId: result.id,
      accessKey: result.chaveAcesso,
      xml: result.xml,
      pdfUrl: result.linkDanfe,
      status: this.mapStatus(result.status),
      issuedAt: result.dataEmissao,
    };
  }

  private mapStatus(
    status: string,
  ): 'authorized' | 'pending' | 'rejected' {
    switch (status.toLowerCase()) {
      case 'autorizada':
      case 'authorized':
        return 'authorized';
      case 'rejeitada':
      case 'rejected':
        return 'rejected';
      default:
        return 'pending';
    }
  }

  // --------------- Mock implementations ---------------

  private mockGenerateNFe(orderData: NFeOrderData): NFeResponse {
    this.logger.warn('Using mock NF-e generation (NFE_API_KEY not set)');
    const accessKey = Array.from({ length: 44 }, () =>
      Math.floor(Math.random() * 10),
    ).join('');

    const nfeId = `NFe-${Date.now()}-${orderData.orderId.slice(0, 8)}`;
    return {
      nfeId,
      accessKey,
      xml: `<mock><nfeProc><NFe><infNFe Id="NFe${accessKey}"><orderId>${orderData.orderId}</orderId></infNFe></NFe></nfeProc></mock>`,
      pdfUrl: `/nota-fiscal/${orderData.orderId}/pdf`,
      status: 'authorized',
      issuedAt: new Date().toISOString(),
    };
  }

  private mockGetNFe(nfeId: string): NFeResponse {
    this.logger.warn('Using mock NF-e retrieval (NFE_API_KEY not set)');
    return {
      nfeId,
      accessKey: '00000000000000000000000000000000000000000000',
      xml: '<mock/>',
      pdfUrl: `/nota-fiscal/${nfeId}/pdf`,
      status: 'authorized',
      issuedAt: new Date().toISOString(),
    };
  }
}
