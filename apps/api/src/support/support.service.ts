import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertSafeUrl } from '../common/services/url-validator';

export interface CreateTicketInput {
  subject: string;
  body: string;
  category?: string;
  priority?: string;
  orderId?: string;
  attachments?: string[];
}

export interface ReplyInput {
  body: string;
}

/**
 * In-house support / help-desk pipeline. Tickets are stored locally in
 * SupportTicket and, when SUPPORT_CRM_WEBHOOK_URL is set, mirrored to
 * the ops CRM (kennypy/CRM) via an HMAC-signed POST. The CRM is the
 * ops workspace; users always interact with the in-app ticket thread
 * so we stay one integration deep.
 *
 * Outbound webhook is best-effort (fire-and-forget). A CRM outage
 * never blocks ticket creation — the in-house record is authoritative.
 * A nightly reconcile cron (future) will replay any tickets whose
 * externalTicketId is still null.
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  async createTicket(userId: string, input: CreateTicketInput) {
    const subject = (input.subject ?? '').trim();
    const body = (input.body ?? '').trim();
    if (subject.length < 3 || subject.length > 200) {
      throw new BadRequestException('Assunto deve ter entre 3 e 200 caracteres.');
    }
    if (body.length < 10 || body.length > 5000) {
      throw new BadRequestException('Descrição deve ter entre 10 e 5000 caracteres.');
    }

    const category = this.parseCategory(input.category);
    const priority = this.parsePriority(input.priority);

    // Order ownership gate — a user can only attach their own orders.
    if (input.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: input.orderId },
        select: { buyerId: true, sellerId: true },
      });
      if (!order || (order.buyerId !== userId && order.sellerId !== userId)) {
        throw new ForbiddenException('Você não tem acesso a este pedido.');
      }
    }

    const attachments = Array.isArray(input.attachments)
      ? input.attachments.filter((u) => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 10)
      : [];

    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId,
        subject,
        body,
        category,
        priority,
        orderId: input.orderId ?? undefined,
        attachments,
      },
    });

    // Fire-and-forget outbound mirror to the ops CRM.
    this.mirrorToCrm(ticket).catch((err) => {
      this.logger.warn(`CRM mirror failed for ${ticket.id}: ${String(err).slice(0, 200)}`);
    });

    return ticket;
  }

  async replyToTicket(ticketId: string, senderId: string, input: ReplyInput, isAgent: boolean) {
    const body = (input.body ?? '').trim();
    if (body.length < 1 || body.length > 5000) {
      throw new BadRequestException('Mensagem deve ter entre 1 e 5000 caracteres.');
    }
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket não encontrado.');
    if (!isAgent && ticket.userId !== senderId) {
      throw new ForbiddenException('Acesso negado.');
    }

    const message = await this.prisma.supportTicketMessage.create({
      data: {
        ticketId,
        senderId,
        senderRole: isAgent ? 'agent' : 'user',
        body,
      },
    });

    // Bump ticket status when user replies on a CLOSED/RESOLVED ticket
    // (re-opens the conversation) and when agents respond to OPEN
    // tickets (moves to IN_PROGRESS).
    if (!isAgent && (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED')) {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'OPEN', resolvedAt: null },
      });
    } else if (isAgent && ticket.status === 'OPEN') {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'IN_PROGRESS' },
      });
      // Notify the user an agent replied.
      this.notifications
        .createNotification(
          ticket.userId,
          'support',
          'Nova resposta no seu ticket',
          `Sua solicitação "${ticket.subject}" recebeu uma resposta.`,
          { ticketId },
          'news',
        )
        .catch(() => {});
    }

    return message;
  }

  async getMyTickets(userId: string, page = 1, pageSize = 20) {
    page = Math.max(1, page);
    pageSize = Math.min(100, Math.max(1, pageSize));
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.supportTicket.count({ where: { userId } }),
    ]);
    return { items, total, page, pageSize, hasMore: skip + items.length < total };
  }

  async getTicket(ticketId: string, userId: string, isAgent: boolean) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        user: { select: { id: true, name: true, email: true } },
        order: { select: { id: true, status: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket não encontrado.');
    if (!isAgent && ticket.userId !== userId) {
      throw new ForbiddenException('Acesso negado.');
    }
    return ticket;
  }

  /**
   * Admin: resolve / close a ticket. Agents can do this from /admin/support.
   * A resolved ticket can be re-opened by the user replying.
   */
  async resolveTicket(ticketId: string, adminId: string, note?: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket não encontrado.');
    if (note) {
      await this.prisma.supportTicketMessage.create({
        data: {
          ticketId,
          senderId: adminId,
          senderRole: 'agent',
          body: note,
        },
      });
    }
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
  }

  /**
   * Outbound mirror to the ops CRM. HMAC-signed payload so the CRM
   * can verify origin; 5s timeout, single attempt (cron retry is a
   * future follow-up). SSRF-protected via assertSafeUrl.
   */
  private async mirrorToCrm(ticket: { id: string; userId: string; subject: string; body: string; category: string; priority: string; orderId: string | null; createdAt: Date }): Promise<void> {
    const url = this.config.get<string>('SUPPORT_CRM_WEBHOOK_URL', '');
    const secret = this.config.get<string>('SUPPORT_CRM_WEBHOOK_SECRET', '');
    if (!url || !secret) return;

    await assertSafeUrl(url, { resolve: true });

    const payload = JSON.stringify({
      source: 'vintage.br',
      ticketId: ticket.id,
      userId: ticket.userId,
      subject: ticket.subject,
      body: ticket.body,
      category: ticket.category,
      priority: ticket.priority,
      orderId: ticket.orderId,
      createdAt: ticket.createdAt.toISOString(),
    });
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vintage-Signature': signature,
        },
        body: payload,
        signal: controller.signal,
      });
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { externalTicketId?: string };
        if (body.externalTicketId) {
          await this.prisma.supportTicket.update({
            where: { id: ticket.id },
            data: { externalTicketId: body.externalTicketId },
          });
        }
      } else {
        this.logger.warn(`CRM mirror returned ${res.status} for ${ticket.id}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private parseCategory(raw?: string): 'ORDER_ISSUE' | 'PAYMENT' | 'SHIPPING' | 'REFUND' | 'ACCOUNT' | 'LISTING' | 'FRAUD' | 'OTHER' {
    const allowed = ['ORDER_ISSUE', 'PAYMENT', 'SHIPPING', 'REFUND', 'ACCOUNT', 'LISTING', 'FRAUD', 'OTHER'] as const;
    if (raw && (allowed as readonly string[]).includes(raw)) {
      return raw as (typeof allowed)[number];
    }
    return 'OTHER';
  }

  private parsePriority(raw?: string): 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' {
    const allowed = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
    if (raw && (allowed as readonly string[]).includes(raw)) {
      return raw as (typeof allowed)[number];
    }
    return 'NORMAL';
  }
}
