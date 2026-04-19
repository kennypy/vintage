import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildAllowedImageHosts,
  validateImageUrl,
} from '../common/validators/image-url.validator';

@Injectable()
export class AuthenticityService {
  private readonly allowedImageHosts: string[];

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private config: ConfigService,
  ) {
    // Pen-test follow-up P-12: proof URLs are written straight to the
    // database and later surfaced in the admin review UI; without
    // validation, a seller could submit any URL — perfect for
    // data-exfil on admin browsers (beaconed image loads) or phishing
    // links disguised as images. Reuse the same allowlist we use for
    // listing photos so a single ops flip of ALLOWED_IMAGE_HOSTS
    // keeps both surfaces in sync.
    this.allowedImageHosts = buildAllowedImageHosts(this.config);
  }

  /**
   * Seller submits an authenticity request for a listing.
   * Proof photos (receipt, tags, care labels) must already be uploaded to S3
   * via the existing /uploads/listing-image endpoint — seller passes the URLs here.
   */
  async submitRequest(sellerId: string, listingId: string, proofImageUrls: string[]) {
    if (!proofImageUrls || proofImageUrls.length === 0) {
      throw new BadRequestException('Envie pelo menos uma foto de comprovante (etiqueta, nota fiscal ou cuidado)');
    }
    if (proofImageUrls.length > 5) {
      throw new BadRequestException('Máximo de 5 fotos de comprovante');
    }

    // Validate every proof URL before we touch the DB.
    for (const u of proofImageUrls) {
      validateImageUrl(u, this.allowedImageHosts);
    }

    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Anúncio não encontrado');
    if (listing.sellerId !== sellerId) throw new ForbiddenException('Acesso negado');
    if (listing.status === 'DELETED' || listing.status === 'SOLD') {
      throw new BadRequestException('Não é possível solicitar autenticação para este anúncio');
    }

    const existing = await this.prisma.authenticityRequest.findUnique({ where: { listingId } });
    if (existing) {
      if (existing.status === 'PENDING') throw new ConflictException('Já existe uma solicitação pendente para este anúncio');
      if (existing.status === 'APPROVED') throw new ConflictException('Este anúncio já está autenticado');
      // REJECTED — allow resubmission
      return this.prisma.authenticityRequest.update({
        where: { listingId },
        data: { proofImageUrls, status: 'PENDING', reviewNote: null, reviewedBy: null },
      });
    }

    return this.prisma.authenticityRequest.create({
      data: { listingId, sellerId, proofImageUrls },
    });
  }

  /** Get authenticity request for a listing (seller or admin) */
  async getRequestByListing(listingId: string, requesterId: string) {
    const request = await this.prisma.authenticityRequest.findUnique({
      where: { listingId },
      include: { listing: { select: { sellerId: true, title: true } } },
    });
    if (!request) throw new NotFoundException('Solicitação não encontrada');

    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      select: { role: true },
    });
    const isAdmin = requester?.role === 'ADMIN';
    const isSeller = request.listing.sellerId === requesterId;

    if (!isAdmin && !isSeller) throw new ForbiddenException('Acesso negado');
    return request;
  }

  /** Admin: list all pending authenticity requests */
  async listPending(page: number = 1, pageSize: number = 20) {
    page = Math.max(1, Number(page) || 1);
    pageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.authenticityRequest.findMany({
        where: { status: 'PENDING' },
        include: {
          listing: { select: { id: true, title: true, images: { take: 1 } } },
          seller: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: pageSize,
      }),
      this.prisma.authenticityRequest.count({ where: { status: 'PENDING' } }),
    ]);
    return { items, total, page, pageSize, hasMore: skip + items.length < total };
  }

  /** Admin: approve or reject an authenticity request */
  async reviewRequest(
    requestId: string,
    adminId: string,
    decision: 'APPROVED' | 'REJECTED',
    reviewNote?: string,
  ) {
    const request = await this.prisma.authenticityRequest.findUnique({
      where: { id: requestId },
      include: { listing: { select: { title: true, sellerId: true } } },
    });
    if (!request) throw new NotFoundException('Solicitação não encontrada');
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Esta solicitação já foi processada');
    }

    // Update request status
    const updated = await this.prisma.authenticityRequest.update({
      where: { id: requestId },
      data: { status: decision, reviewNote: reviewNote ?? null, reviewedBy: adminId },
    });

    // If approved, mark the listing as authentic
    if (decision === 'APPROVED') {
      await this.prisma.listing.update({
        where: { id: request.listingId },
        data: { isAuthentic: true },
      });
    }

    // Notify seller
    const title = decision === 'APPROVED'
      ? 'Anúncio autenticado!'
      : 'Solicitação de autenticação recusada';
    const body = decision === 'APPROVED'
      ? `Seu anúncio "${request.listing.title}" recebeu o selo Autêntico.`
      : `Sua solicitação para "${request.listing.title}" foi recusada.${reviewNote ? ` Motivo: ${reviewNote}` : ''}`;

    await this.notificationsService.createNotification(
      request.listing.sellerId,
      decision === 'APPROVED' ? 'AUTHENTICITY_APPROVED' : 'AUTHENTICITY_REJECTED',
      title,
      body,
      { listingId: request.listingId },
    );

    return updated;
  }
}
