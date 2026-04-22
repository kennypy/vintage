import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

/**
 * Twilio-backed SMS gateway. In dev mode (no TWILIO_* env vars) messages
 * are logged to stdout so local flows work without an account. In production
 * startup fails earlier (main.ts secret check) if TWILIO_AUTH_TOKEN is a
 * placeholder — so this service can assume credentials are real when
 * isConfigured() returns true.
 *
 * We only handle outbound sends here; inbound/webhook flows (Twilio status
 * callbacks) are intentionally not exposed because we don't need them for
 * SMS 2FA (the user types the code back into the app, not SMS reply).
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly client: Twilio | null;
  private readonly from: string;
  private readonly whatsappFrom: string;
  private readonly configured: boolean;

  constructor(private readonly config: ConfigService) {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID', '');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN', '');
    this.from = this.config.get<string>('TWILIO_FROM_NUMBER', '');
    // WhatsApp sender in Twilio-canonical "whatsapp:+55..." form. Derived
    // from TWILIO_WHATSAPP_FROM if set — otherwise WhatsApp-delivery
    // helpers fall back to sendSms, so the same user-facing text still
    // lands via SMS if the WhatsApp sender isn't configured yet.
    const rawWa = this.config.get<string>('TWILIO_WHATSAPP_FROM', '');
    this.whatsappFrom = rawWa
      ? rawWa.startsWith('whatsapp:')
        ? rawWa
        : `whatsapp:${rawWa}`
      : '';

    this.configured = Boolean(sid && token && this.from);
    this.client = this.configured ? new Twilio(sid, token) : null;

    if (!this.configured) {
      this.logger.log(
        'Twilio não configurado — SMS serão logados no console (modo desenvolvimento).',
      );
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  isWhatsappConfigured(): boolean {
    return this.configured && Boolean(this.whatsappFrom);
  }

  /**
   * Validate that a phone number is in E.164 format (+CCNNNNNNN...).
   * We reject anything else at the boundary so Twilio doesn't silently
   * accept malformed numbers and charge us for an undeliverable send.
   */
  static isValidE164(phone: string): boolean {
    return /^\+[1-9]\d{7,14}$/.test(phone);
  }

  /**
   * Send an SMS. Throws on transport failure so callers can surface
   * "please try again" to the user — otherwise a silently-dropped 2FA
   * code would lock users out. In dev mode we never throw, we just log.
   */
  async sendSms(to: string, body: string): Promise<void> {
    if (!SmsService.isValidE164(to)) {
      throw new Error(`Invalid phone number format (must be E.164): ${to}`);
    }
    if (!this.configured || !this.client) {
      // Dev fallback: log full SMS content so the developer can read the code.
      // In production this branch is unreachable because startup fails on
      // placeholder Twilio creds via main.ts secret validation.
      this.logger.log(`[SMS DEV] Para: ${to}\n${body}`);
      return;
    }

    try {
      await this.client.messages.create({
        to,
        from: this.from,
        body,
      });
    } catch (err) {
      this.logger.error(
        `Twilio send failed to ${to}: ${String(err).slice(0, 200)}`,
      );
      throw new Error('Falha ao enviar SMS. Tente novamente em instantes.', {
        cause: err,
      });
    }
  }

  /**
   * Send a WhatsApp message via Twilio. Used for transactional alerts
   * (shipping, order events) — Brazilian users strongly prefer
   * WhatsApp over SMS for these. Falls back to sendSms when
   * TWILIO_WHATSAPP_FROM isn't configured so the same caller can
   * keep writing one line of code per notification.
   *
   * NOTE: Twilio WhatsApp only permits template messages outside a
   * 24h customer-initiated session. Transactional shipping updates
   * are fine because the order itself counts as initiation, but any
   * marketing content must use an approved template. Callers here
   * only use it for shipping/order flows.
   */
  async sendWhatsapp(to: string, body: string): Promise<void> {
    if (!SmsService.isValidE164(to)) {
      throw new Error(`Invalid phone number format (must be E.164): ${to}`);
    }
    if (!this.configured || !this.client || !this.whatsappFrom) {
      // Fall back to SMS if WhatsApp sender isn't provisioned yet.
      return this.sendSms(to, body);
    }

    try {
      await this.client.messages.create({
        to: `whatsapp:${to}`,
        from: this.whatsappFrom,
        body,
      });
    } catch (err) {
      this.logger.warn(
        `Twilio WhatsApp send failed to ${to}, falling back to SMS: ${String(err).slice(0, 200)}`,
      );
      // Best-effort fallback — never throw, shipping alerts are
      // side-channel to the in-app bell.
      return this.sendSms(to, body);
    }
  }
}
