import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NFeClient } from './nfe.client';
import { Decimal } from '@prisma/client/runtime/client';

export interface NFeData {
  nfeId: string | null;
  orderId: string;
  accessKey: string | null;
  xml: string | null;
  pdfUrl: string | null;
  status: 'authorized' | 'pending' | 'rejected';
  issuedAt: Date | null;
}

export interface TaxBreakdown {
  icms: number;
  iss: number;
  total: number;
  effectiveRate: number;
}

// ICMS intrastate rates per state (source: CONFAZ / state legislation)
const ICMS_INTRASTATE_RATES: Record<string, number> = {
  AC: 0.19, AL: 0.19, AP: 0.18, AM: 0.20, BA: 0.205,
  CE: 0.20, DF: 0.20, ES: 0.17, GO: 0.19, MA: 0.22,
  MT: 0.17, MS: 0.17, MG: 0.18, PA: 0.19, PB: 0.20,
  PR: 0.195, PE: 0.205, PI: 0.21, RJ: 0.22, RN: 0.18,
  RS: 0.17, RO: 0.195, RR: 0.20, SC: 0.17, SP: 0.18,
  SE: 0.19, TO: 0.20,
};

// ICMS interstate rates (simplified CONFAZ table)
// From South/Southeast (except ES) to North/Northeast/Center-West/ES: 7%
// All other interstate: 12%
const SOUTH_SOUTHEAST_STATES = new Set(['SP', 'RJ', 'MG', 'PR', 'SC', 'RS']);
const NORTH_NE_CW_ES_STATES = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'PA', 'PB', 'PE', 'PI', 'RN', 'RO',
  'RR', 'SE', 'TO',
]);

function getInterstateIcmsRate(originState: string, destinationState: string): number {
  const origin = originState.toUpperCase();
  const destination = destinationState.toUpperCase();

  if (SOUTH_SOUTHEAST_STATES.has(origin) && NORTH_NE_CW_ES_STATES.has(destination)) {
    return 0.07;
  }
  return 0.12;
}

// ISS rate for platform service fees (not applied to goods)
const ISS_PLATFORM_FEE_RATE = 0.05;

@Injectable()
export class NotaFiscalService {
  private readonly logger = new Logger(NotaFiscalService.name);

  constructor(
    private prisma: PrismaService,
    private readonly nfeClient: NFeClient,
  ) {}

  async generateNFe(orderId: string, userId: string): Promise<NFeData> {
    // Load order with buyer, seller, and shipping address
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: { select: { id: true, cpf: true } },
        seller: {
          select: {
            id: true,
            cnpj: true,
            cpfIdentityVerified: true,
            addresses: {
              where: { isDefault: true },
              take: 1,
              select: { state: true },
            },
          },
        },
        shippingAddress: { select: { state: true } },
        notaFiscal: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    // Authorization: only buyer or seller can generate/view NF-e
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Acesso negado a este pedido');
    }

    // Return existing NF-e if already generated — re-reading an
    // NF-e that was emitted while the seller was verified doesn't
    // need re-validation; the identity gate only applies to NEW
    // emissions below.
    if (order.notaFiscal) {
      return this.mapToNFeData(order.notaFiscal);
    }

    // Identity gate — we can't emit a tax document on behalf of
    // a seller whose identity hasn't been confirmed at Receita.
    // Gate is on the SELLER's cpfIdentityVerified; buyers don't
    // need KYC to receive an NF-e.
    if (!order.seller.cpfIdentityVerified) {
      throw new BadRequestException(
        'Nota fiscal indisponível — vendedor ainda não concluiu a verificação de identidade.',
      );
    }

    // Resolve origin state from seller's default address
    const sellerAddress = order.seller.addresses[0];
    const originState = sellerAddress?.state?.toUpperCase() || 'SP';

    // Resolve destination state from order's shipping address
    const destinationState = order.shippingAddress?.state?.toUpperCase() || 'SP';

    // Calculate tax on the item price (ICMS on goods)
    const taxBreakdown = this.calculateTax(
      Number(order.itemPriceBrl),
      originState,
      destinationState,
    );

    // Delegate to NF-e client
    const response = await this.nfeClient.generateNFe(
      {
        orderId,
        itemDescription: `Vintage.br - Pedido ${orderId}`,
        itemPriceBrl: Number(order.itemPriceBrl),
        sellerCnpj: order.seller.cnpj || '',
        buyerCpf: order.buyer.cpf || '',
        originState,
        destinationState,
      },
      {
        icms: taxBreakdown.icms,
        iss: taxBreakdown.iss,
        total: taxBreakdown.total,
      },
    );

    // Persist to database
    const notaFiscal = await this.prisma.notaFiscal.create({
      data: {
        orderId,
        nfeId: response.nfeId,
        accessKey: response.accessKey,
        xml: response.xml,
        pdfUrl: response.pdfUrl,
        status: this.mapStatusToEnum(response.status),
        sellerCnpj: order.seller.cnpj || null,
        buyerCpf: order.buyer.cpf || null,
        originState,
        destinationState,
        icmsBrl: new Decimal(taxBreakdown.icms.toFixed(2)),
        issBrl: new Decimal(taxBreakdown.iss.toFixed(2)),
        totalTaxBrl: new Decimal(taxBreakdown.total.toFixed(2)),
        issuedAt: response.issuedAt ? new Date(response.issuedAt) : null,
      },
    });

    this.logger.log(`NF-e generated for order ${orderId}: ${notaFiscal.nfeId}`);

    return this.mapToNFeData(notaFiscal);
  }

  async getNFe(orderId: string, userId: string): Promise<NFeData> {
    const notaFiscal = await this.prisma.notaFiscal.findUnique({
      where: { orderId },
      include: {
        order: { select: { buyerId: true, sellerId: true } },
      },
    });

    if (!notaFiscal) {
      throw new NotFoundException('NF-e não encontrada para este pedido');
    }

    // Authorization: only buyer or seller can view NF-e
    if (notaFiscal.order.buyerId !== userId && notaFiscal.order.sellerId !== userId) {
      throw new ForbiddenException('Acesso negado a esta NF-e');
    }

    return this.mapToNFeData(notaFiscal);
  }

  calculateTax(
    itemPriceBrl: number,
    originState: string,
    destinationState: string,
  ): TaxBreakdown {
    const origin = originState.toUpperCase();
    const destination = destinationState.toUpperCase();
    const isIntrastate = origin === destination;

    // ICMS: state-aware rates for goods
    const icmsRate = isIntrastate
      ? (ICMS_INTRASTATE_RATES[destination] ?? 0.18)
      : getInterstateIcmsRate(origin, destination);

    // ISS: applies only to platform service fee, not to item price.
    // For tax preview, we show ISS as 0 since it's on the platform commission,
    // not on the item being sold.
    const issRate = 0;

    const icms = Math.round(itemPriceBrl * icmsRate * 100) / 100;
    const iss = Math.round(itemPriceBrl * issRate * 100) / 100;
    const total = Math.round((icms + iss) * 100) / 100;
    const effectiveRate =
      itemPriceBrl > 0
        ? Math.round(((icms + iss) / itemPriceBrl) * 10000) / 100
        : 0;

    return { icms, iss, total, effectiveRate };
  }

  /**
   * Calculate ISS on platform commission (service fee).
   * Used internally for platform revenue accounting.
   */
  calculatePlatformIssBrl(commissionBrl: number): number {
    return Math.round(commissionBrl * ISS_PLATFORM_FEE_RATE * 100) / 100;
  }

  /**
   * Sweep NF-e rows that are still PENDING after the synchronous issuance
   * call and ask the provider for their current status. Enotas / NFe.io
   * asynchronously validate most NF-es within 30–120s, so rows that
   * didn't settle in the POST response usually settle within minutes.
   *
   * Runs every minute, bounded to 25 rows per sweep. At steady state
   * that's ~0.4 req/s against the NF-e provider — well inside Enotas /
   * NFe.io's published limits (~5 req/s/account). Under a 1000-row
   * backlog the sweep takes ~40 minutes to drain, which is slower than
   * 30s/50-row tuning but avoids risking a 429 during an order surge.
   * If ops sees the backlog growing, bump `take:` after confirming the
   * contracted rate limit with the provider.
   *
   * Rows older than 24 hours are skipped — they're past the usual
   * settlement window and ops should investigate manually.
   *
   * Status transitions only come from the provider's response; never
   * from user input. The provider is the source of truth.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async pollPendingNFeStatus(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pending = await this.prisma.notaFiscal.findMany({
      where: {
        status: 'PENDING',
        nfeId: { not: null },
        createdAt: { gt: cutoff },
      },
      take: 25,
      orderBy: { createdAt: 'asc' },
      select: { id: true, nfeId: true, orderId: true },
    });

    for (const row of pending) {
      if (!row.nfeId) continue;
      try {
        const fresh = await this.nfeClient.getNFe(row.nfeId);
        if (fresh.status !== 'pending') {
          await this.prisma.notaFiscal.update({
            where: { id: row.id },
            data: {
              status: this.mapStatusToEnum(fresh.status),
              accessKey: fresh.accessKey || undefined,
              xml: fresh.xml || undefined,
              pdfUrl: fresh.pdfUrl || undefined,
              issuedAt: fresh.issuedAt ? new Date(fresh.issuedAt) : undefined,
            },
          });
          this.logger.log(
            `NF-e ${row.nfeId} for order ${row.orderId} promoted: PENDING → ${fresh.status}`,
          );
        }
      } catch (err) {
        // Never let a single provider failure block the rest of the sweep
        // or crash the worker. The row stays PENDING for the next run.
        this.logger.warn(
          `pollPendingNFeStatus: ${row.nfeId} — ${String(err).slice(0, 200)}`,
        );
      }
    }
  }

  private mapStatusToEnum(status: string): 'PENDING' | 'AUTHORIZED' | 'REJECTED' | 'CANCELLED' {
    switch (status) {
      case 'authorized': return 'AUTHORIZED';
      case 'rejected': return 'REJECTED';
      case 'cancelled': return 'CANCELLED';
      default: return 'PENDING';
    }
  }

  private mapToNFeData(notaFiscal: {
    nfeId: string | null;
    orderId: string;
    accessKey: string | null;
    xml: string | null;
    pdfUrl: string | null;
    status: string;
    issuedAt: Date | null;
  }): NFeData {
    return {
      nfeId: notaFiscal.nfeId,
      orderId: notaFiscal.orderId,
      accessKey: notaFiscal.accessKey,
      xml: notaFiscal.xml,
      pdfUrl: notaFiscal.pdfUrl,
      status: notaFiscal.status === 'AUTHORIZED'
        ? 'authorized'
        : notaFiscal.status === 'REJECTED'
          ? 'rejected'
          : 'pending',
      issuedAt: notaFiscal.issuedAt,
    };
  }
}
