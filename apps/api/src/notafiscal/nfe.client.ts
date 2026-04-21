import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertSafeUrl } from '../common/services/url-validator';

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

interface NFeProviderResponse {
  id: string;
  chaveAcesso: string;
  xml: string;
  linkDanfe: string;
  status: string;
  dataEmissao: string;
}

// Hard upper bound on provider response time. NFe providers are sometimes
// sluggish under load; 15s is enough for the real endpoint while refusing
// to let a single order hang an API worker indefinitely.
const HTTP_TIMEOUT_MS = 15_000;

// Exponential backoff: retry twice on 5xx / network errors with widening
// pauses. 4xx bodies are never retried — the provider is telling us our
// input is wrong and retrying won't change it.
const HTTP_RETRY_DELAYS_MS = [750, 2_000];

/**
 * Supported NF-e providers. Focus NFe is the primary issuer post-launch
 * (REST API, MEI/Simples/Lucro Presumido coverage, sandbox env);
 * 'enotas' is kept as a fallback for the legacy integration. Swap via
 * NFE_PROVIDER without a code change.
 */
type NFeProvider = 'focus' | 'enotas';

@Injectable()
export class NFeClient {
  private readonly logger = new Logger(NFeClient.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly nodeEnv: string;
  private readonly provider: NFeProvider;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('NFE_API_KEY', '');
    this.provider =
      (this.configService.get<string>('NFE_PROVIDER', 'focus') as NFeProvider) ===
      'enotas'
        ? 'enotas'
        : 'focus';
    // Provider-appropriate default. Ops can still override via
    // NFE_API_URL (e.g. Focus's sandbox vs prod host).
    const defaultUrl =
      this.provider === 'focus'
        ? 'https://api.focusnfe.com.br'
        : 'https://api.enotas.com.br/v2';
    this.baseUrl = this.configService.get<string>('NFE_API_URL', defaultUrl);
    this.nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
  }

  private get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Focus NFe authenticates via HTTP Basic with the token as the
   * username and an empty password. eNotas uses Bearer tokens.
   */
  private authHeader(): string {
    if (this.provider === 'focus') {
      const encoded = Buffer.from(`${this.apiKey}:`).toString('base64');
      return `Basic ${encoded}`;
    }
    return `Bearer ${this.apiKey}`;
  }

  /**
   * Issue an authenticated request to the NFe provider. Wraps native
   * fetch with:
   *   - SSRF validation of the resolved URL (no private/loopback/cloud
   *     metadata targets even if NFE_API_URL is compromised)
   *   - 15-second AbortSignal timeout (prevents an order flow hanging)
   *   - Retry-with-backoff on 5xx and network errors (idempotent POSTs
   *     are safe here because NFe providers dedupe by orderId; GETs are
   *     naturally idempotent)
   *   - Error-message sanitisation — provider errors stay in server logs;
   *     clients see a generic "NF-e provider unavailable" message to
   *     prevent PII leak if the provider echoes our request body.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    // Re-validate against SSRF at request time — not just at config-load
    // — to defend against DNS rebinding. `assertSafeUrl` resolves the
    // hostname and rejects private/reserved IPs.
    await assertSafeUrl(url, { resolve: true });

    let lastError: unknown;
    for (let attempt = 0; attempt <= HTTP_RETRY_DELAYS_MS.length; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: this.authHeader(),
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (response.ok) {
          return (await response.json()) as T;
        }

        const errorText = String(await response.text()).slice(0, 200);
        this.logger.error(
          `NF-e API ${method} ${path} → ${response.status}: ${errorText}`,
        );

        // 4xx is OUR fault (bad input, auth, etc.). Don't retry. Surface
        // a generic 500 to the caller so we don't leak the provider's
        // error body (which may echo the order / CPF).
        if (response.status >= 400 && response.status < 500) {
          throw new InternalServerErrorException(
            'Falha ao emitir nota fiscal. Entre em contato com o suporte.',
          );
        }

        // 5xx — retryable. Fall through to the delay + next attempt.
        lastError = new Error(`NF-e API ${response.status}`);
      } catch (err) {
        if (err instanceof InternalServerErrorException) throw err;
        lastError = err;
        const tag = (err as { name?: string })?.name;
        if (tag === 'AbortError') {
          this.logger.warn(`NF-e API ${method} ${path} timed out (attempt ${attempt + 1})`);
        } else {
          this.logger.warn(`NF-e API ${method} ${path} network error: ${String(err).slice(0, 200)}`);
        }
      } finally {
        clearTimeout(timer);
      }

      // Retry path: wait and try again. If we've used all retries, the
      // loop exits and we throw below.
      if (attempt < HTTP_RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, HTTP_RETRY_DELAYS_MS[attempt]));
      }
    }

    this.logger.error(
      `NF-e API ${method} ${path} failed after retries: ${String(lastError).slice(0, 200)}`,
    );
    throw new InternalServerErrorException(
      'Serviço de nota fiscal indisponível no momento. Tente novamente.',
    );
  }

  /**
   * Generate NF-e via the provider API.
   *
   * Idempotency: the provider (Enotas / NFe.io / Focus NFe) dedupes by
   * `pedidoId` — our `orderId`. A retry with the same order returns the
   * NF-e that was already issued instead of double-issuing. The caller
   * (NotaFiscalService) also short-circuits via the `order.notaFiscal`
   * check before reaching this method.
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

    if (this.provider === 'focus') {
      // Focus NFe uses `v2/nfe` with a reference (idempotency key) and
      // distinct payload fields. Response shape also differs — normalise
      // via mapFocusResponse below.
      const result = await this.request<Record<string, unknown>>(
        'POST',
        `/v2/nfe?ref=${encodeURIComponent(orderData.orderId)}`,
        {
          natureza_operacao: 'Venda',
          data_emissao: new Date().toISOString(),
          tipo_documento: 1, // saída
          finalidade_emissao: 1, // NF-e normal
          cnpj_emitente: orderData.sellerCnpj,
          cpf_destinatario: orderData.buyerCpf,
          uf_emitente: orderData.originState,
          uf_destinatario: orderData.destinationState,
          valor_produtos: orderData.itemPriceBrl,
          valor_total: orderData.itemPriceBrl,
          valor_icms: taxInfo.icms,
          valor_iss: taxInfo.iss,
          items: [
            {
              numero_item: 1,
              codigo_produto: orderData.orderId,
              descricao: orderData.itemDescription,
              quantidade_comercial: 1,
              valor_unitario_comercial: orderData.itemPriceBrl,
              valor_bruto: orderData.itemPriceBrl,
            },
          ],
        },
      );
      return this.mapFocusResponse(result);
    }

    // eNotas (legacy) path.
    const result = await this.request<NFeProviderResponse>('POST', '/nfe', {
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

    return this.normaliseResponse(result);
  }

  /**
   * Focus NFe returns (after an async authorization step) fields like
   * `caminho_xml_nota_fiscal`, `chave_nfe`, `status`, `numero`. Map
   * into our stable NFeResponse shape. Status strings come back as
   * 'autorizado' once SEFAZ clears the issuance.
   */
  private mapFocusResponse(r: Record<string, unknown>): NFeResponse {
    const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '');
    return {
      nfeId: str('ref') || str('numero') || '',
      accessKey: str('chave_nfe'),
      xml: str('caminho_xml_nota_fiscal'),
      pdfUrl: str('caminho_danfe'),
      status: this.mapStatus(str('status')),
      issuedAt: str('data_emissao') || new Date().toISOString(),
    };
  }

  /**
   * Retrieve existing NF-e by ID. Used by the status-polling cron to
   * promote PENDING rows once the provider moves them to authorized.
   */
  async getNFe(nfeId: string): Promise<NFeResponse> {
    if (!this.isConfigured) {
      if (this.nodeEnv === 'production') {
        throw new Error('NF-e service not configured — cannot operate in production');
      }
      return this.mockGetNFe(nfeId);
    }

    if (this.provider === 'focus') {
      // Focus NFe lookup is by the `ref` we supplied on create — i.e.
      // our orderId, NOT the autogenerated numero. Callers of getNFe
      // pass the id we stored on NotaFiscal.nfeId, which is populated
      // from mapFocusResponse (ref / numero).
      const result = await this.request<Record<string, unknown>>(
        'GET',
        `/v2/nfe/${encodeURIComponent(nfeId)}`,
      );
      return this.mapFocusResponse(result);
    }

    const result = await this.request<NFeProviderResponse>(
      'GET',
      `/nfe/${encodeURIComponent(nfeId)}`,
    );
    return this.normaliseResponse(result);
  }

  private normaliseResponse(result: NFeProviderResponse): NFeResponse {
    return {
      nfeId: String(result.id ?? ''),
      accessKey: String(result.chaveAcesso ?? ''),
      xml: String(result.xml ?? ''),
      pdfUrl: String(result.linkDanfe ?? ''),
      status: this.mapStatus(String(result.status ?? '')),
      issuedAt: String(result.dataEmissao ?? new Date().toISOString()),
    };
  }

  private mapStatus(
    status: string,
  ): 'authorized' | 'pending' | 'rejected' {
    switch (status.toLowerCase()) {
      case 'autorizada':
      case 'autorizado':
      case 'authorized':
        return 'authorized';
      case 'rejeitada':
      case 'rejeitado':
      case 'cancelado':
      case 'cancelada':
      case 'rejected':
        return 'rejected';
      case 'processando_autorizacao':
      case 'em_processamento':
      case 'pendente':
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
