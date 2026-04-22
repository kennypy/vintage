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

/** Agent reply coming in from CRM via /partner/support/*. */
export interface AgentReplyInput {
  agentName: string;
  body: string;
  attachmentUrls?: string[];
}

export interface AgentResolveInput {
  agentName: string;
  note?: string;
}

/** Shape of every outbound CRM webhook event. */
type CrmEvent =
  | 'ticket.opened'
  | 'ticket.user_replied'
  | 'ticket.user_reopened';

/**
 * Canonical email for the shared "Suporte Vintage" account. Every
 * agent-authored message is stored with this user's ID as senderId;
 * the actual agent display name travels in SupportTicketMessage.senderDisplayName.
 */
const SUPPORT_SYSTEM_EMAIL = 'support@vintage.br';
const SUPPORT_SYSTEM_NAME = 'Suporte Vintage';

/**
 * In-house support / help-desk pipeline. Tickets are stored locally in
 * SupportTicket and, when CRM webhook env vars are set, mirrored to the
 * ops CRM (kennypy/CRM) via an HMAC-signed POST. The CRM is the agent
 * workspace; users always interact with the in-app thread so we stay
 * one integration deep.
 *
 * Outbound is best-effort (fire-and-forget, 5s timeout). A CRM outage
 * never blocks ticket creation — the in-house record is authoritative.
 * Failures are logged to AuditLog and replayed by the reconcile cron
 * in support-cron.service.ts.
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  private systemUserIdCache: string | null = null;

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
    this.emitCrmEvent('ticket.opened', ticket.id).catch(() => {
      /* emitCrmEvent handles its own logging + AuditLog trail */
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

    // Status transitions + CRM emission for user-originated events.
    const wasClosed = ticket.status === 'CLOSED' || ticket.status === 'RESOLVED';
    if (!isAgent && wasClosed) {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'OPEN', resolvedAt: null },
      });
      this.emitCrmEvent('ticket.user_reopened', ticketId, { messageId: message.id }).catch(() => {});
    } else if (!isAgent) {
      this.emitCrmEvent('ticket.user_replied', ticketId, { messageId: message.id, body }).catch(
        () => {},
      );
    } else if (isAgent && ticket.status === 'OPEN') {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'IN_PROGRESS' },
      });
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

  /**
   * Agent reply coming in from CRM. All CRM-originated replies collapse
   * onto the shared support@vintage.br system user as senderId; the real
   * agent's display name is stored on the message row. Optional
   * CRM-hosted attachment URLs are stored as-is — we never fetch or
   * re-host them.
   */
  async agentReply(ticketId: string, input: AgentReplyInput) {
    const body = (input.body ?? '').trim();
    const agentName = (input.agentName ?? '').trim();
    if (body.length < 1 || body.length > 5000) {
      throw new BadRequestException('Mensagem deve ter entre 1 e 5000 caracteres.');
    }
    if (agentName.length < 1 || agentName.length > 80) {
      throw new BadRequestException('agentName obrigatório (1–80 caracteres).');
    }

    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket não encontrado.');

    const systemUserId = await this.getSystemUserId();
    const attachmentUrls = this.sanitizeAttachmentUrls(input.attachmentUrls);

    const message = await this.prisma.supportTicketMessage.create({
      data: {
        ticketId,
        senderId: systemUserId,
        senderRole: 'agent',
        senderDisplayName: agentName,
        body,
        attachmentUrls,
      },
    });

    if (ticket.status === 'OPEN') {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'IN_PROGRESS' },
      });
    } else if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      // An agent reply on a closed ticket re-opens it — same rule
      // we apply when the user replies on a closed ticket.
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'IN_PROGRESS', resolvedAt: null },
      });
    }

    // Notify the user out-of-band regardless of prior status.
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

    return message;
  }

  /**
   * Agent-driven resolve from CRM. Optional final note is posted as a
   * visible message, credited to the agent's display name.
   */
  async agentResolve(ticketId: string, input: AgentResolveInput) {
    const agentName = (input.agentName ?? '').trim();
    if (agentName.length < 1 || agentName.length > 80) {
      throw new BadRequestException('agentName obrigatório (1–80 caracteres).');
    }
    const note = input.note?.trim();
    if (note && note.length > 5000) {
      throw new BadRequestException('Nota não pode ter mais de 5000 caracteres.');
    }

    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket não encontrado.');

    const systemUserId = await this.getSystemUserId();

    if (note) {
      await this.prisma.supportTicketMessage.create({
        data: {
          ticketId,
          senderId: systemUserId,
          senderRole: 'agent',
          senderDisplayName: agentName,
          body: note,
        },
      });
    }

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
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
   * Breakglass resolve for internal AdminSupportController. Normal ops go
   * through agentResolve() from the CRM partner endpoint.
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

  // ────────────────────────────────────────────────────────────────
  // CRM outbound
  // ────────────────────────────────────────────────────────────────

  /**
   * Emit a signed webhook event to the CRM. Fire-and-forget with a 5s
   * timeout. Failures are logged to AuditLog so the reconcile cron can
   * see what's outstanding; for `ticket.opened` we also leave
   * externalTicketId null so the cron knows to retry.
   *
   * Exposed on the service (not private) because support-cron.service
   * calls it to replay unsent opens.
   */
  async emitCrmEvent(
    event: CrmEvent,
    ticketId: string,
    extra: { messageId?: string; body?: string } = {},
  ): Promise<void> {
    const url = this.config.get<string>('SUPPORT_CRM_WEBHOOK_URL', '');
    const secret = this.config.get<string>('SUPPORT_CRM_WEBHOOK_SECRET', '');
    if (!url || !secret) return;

    try {
      await assertSafeUrl(url, { resolve: true });
    } catch (err) {
      await this.logCrmFailure(event, ticketId, 0, `unsafe URL: ${String(err).slice(0, 120)}`);
      return;
    }

    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!ticket) return;

    const payload = this.buildPayload(event, ticket, extra);
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    let status = 0;
    let errorMsg = '';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vintage-Signature': signature,
          'X-Vintage-Event': event,
        },
        body,
        signal: controller.signal,
      });
      status = res.status;
      if (res.ok) {
        if (event === 'ticket.opened') {
          const rbody = (await res.json().catch(() => ({}))) as { externalTicketId?: string };
          if (rbody.externalTicketId) {
            await this.prisma.supportTicket.update({
              where: { id: ticketId },
              data: { externalTicketId: rbody.externalTicketId },
            });
          }
        }
        return;
      }
      errorMsg = `HTTP ${res.status}`;
    } catch (err) {
      errorMsg =
        err instanceof Error && err.name === 'AbortError'
          ? 'timeout after 5s'
          : String(err).slice(0, 160);
    } finally {
      clearTimeout(timer);
    }

    await this.logCrmFailure(event, ticketId, status, errorMsg);
  }

  private buildPayload(
    event: CrmEvent,
    ticket: {
      id: string;
      userId: string;
      subject: string;
      body: string;
      category: string;
      priority: string;
      orderId: string | null;
      attachments: unknown;
      createdAt: Date;
      user: { id: string; name: string; email: string } | null;
    },
    extra: { messageId?: string; body?: string },
  ) {
    const base = {
      source: 'vintage.br' as const,
      ticketId: ticket.id,
      createdAt: new Date().toISOString(),
    };

    if (event === 'ticket.opened') {
      return {
        ...base,
        event,
        userId: ticket.userId,
        userName: ticket.user?.name ?? null,
        userEmail: ticket.user?.email ?? null,
        subject: ticket.subject,
        body: ticket.body,
        category: ticket.category,
        priority: ticket.priority,
        orderId: ticket.orderId,
        attachments: Array.isArray(ticket.attachments) ? ticket.attachments : [],
        createdAt: ticket.createdAt.toISOString(),
      };
    }

    if (event === 'ticket.user_replied') {
      return {
        ...base,
        event,
        userId: ticket.userId,
        messageId: extra.messageId,
        body: extra.body,
      };
    }

    // ticket.user_reopened
    return {
      ...base,
      event,
      userId: ticket.userId,
      messageId: extra.messageId,
    };
  }

  /**
   * Trail row so the reconcile cron + ops can tell what failed to
   * deliver. We piggyback on the general AuditLog table — no dedicated
   * table needed (see PR thread with CRM integration design).
   */
  private async logCrmFailure(
    event: CrmEvent,
    ticketId: string,
    status: number,
    error: string,
  ): Promise<void> {
    this.logger.warn(
      `CRM webhook failed: event=${event} ticket=${ticketId} status=${status} ${error}`,
    );
    try {
      await this.prisma.auditLog.create({
        data: {
          action: 'CRM_WEBHOOK_FAILED',
          targetType: 'support_ticket',
          targetId: ticketId,
          metadata: { event, status, error: error.slice(0, 200) },
        },
      });
    } catch {
      // If the audit log itself is down, there's no correct place to
      // escalate from here — the process log above is the last resort.
    }
  }

  /**
   * Shared system user for agent-authored messages coming in from CRM.
   * Lazy-create on first use so fresh DBs work without a seed step.
   * Cached process-locally after the first lookup.
   */
  private async getSystemUserId(): Promise<string> {
    if (this.systemUserIdCache) return this.systemUserIdCache;

    const existing = await this.prisma.user.findUnique({
      where: { email: SUPPORT_SYSTEM_EMAIL },
      select: { id: true },
    });
    if (existing) {
      this.systemUserIdCache = existing.id;
      return existing.id;
    }

    // Password is a random placeholder — this user cannot log in. The
    // account exists only to satisfy SupportTicketMessage.senderId FK.
    // If anyone ever tries to sign in as support@vintage.br it will
    // fail at the password compare step.
    const placeholder = crypto.randomBytes(48).toString('base64');
    const created = await this.prisma.user.create({
      data: {
        email: SUPPORT_SYSTEM_EMAIL,
        passwordHash: placeholder,
        name: SUPPORT_SYSTEM_NAME,
      },
      select: { id: true },
    });
    this.systemUserIdCache = created.id;
    return created.id;
  }

  private sanitizeAttachmentUrls(raw?: string[]): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((u) => typeof u === 'string' && /^https:\/\//i.test(u))
      .slice(0, 10);
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
