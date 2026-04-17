import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private readonly fromAddress: string;
  private readonly isDev: boolean;

  constructor(private config: ConfigService) {
    const smtpHost = this.config.get<string>('SMTP_HOST');
    this.fromAddress =
      this.config.get<string>('EMAIL_FROM') ||
      'Vintage.br <noreply@vintage.br>';
    this.isDev = !smtpHost;

    if (!this.isDev) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: this.config.get<number>('SMTP_PORT', 587),
        secure: false,
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
    } else {
      this.logger.log(
        'SMTP não configurado — emails serão logados no console (modo desenvolvimento)',
      );
    }
  }

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    const subject = 'Bem-vindo(a) ao Vintage.br!';
    const html = this.buildHtml(`
      <h1 style="color: #333; font-size: 24px; margin-bottom: 16px;">Bem-vindo(a), ${this.escapeHtml(name)}!</h1>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        Estamos muito felizes em ter você na nossa comunidade de moda sustentável.
      </p>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        No Vintage.br, você pode comprar e vender peças de segunda mão com segurança e praticidade.
        Comece agora explorando as melhores ofertas!
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="https://vintage.br" style="background-color: #e91e63; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
          Explorar Vintage.br
        </a>
      </div>
    `);

    await this.send(to, subject, html);
  }

  async sendPasswordResetEmail(
    to: string,
    name: string,
    resetToken: string,
  ): Promise<void> {
    const resetUrl = `https://vintage.br/reset-password?token=${encodeURIComponent(resetToken)}`;
    const subject = 'Redefinição de senha — Vintage.br';
    const html = this.buildHtml(`
      <h1 style="color: #333; font-size: 24px; margin-bottom: 16px;">Olá, ${this.escapeHtml(name)}!</h1>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        Recebemos uma solicitação para redefinir a senha da sua conta no Vintage.br.
      </p>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        Clique no botão abaixo para criar uma nova senha. Este link é válido por 1 hora.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="background-color: #e91e63; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
          Redefinir Senha
        </a>
      </div>
      <p style="color: #999; font-size: 14px; line-height: 1.6;">
        Se você não solicitou essa alteração, ignore este email. Sua senha permanecerá a mesma.
      </p>
    `);

    await this.send(to, subject, html);
  }

  async sendOrderConfirmation(
    to: string,
    name: string,
    orderId: string,
    totalBrl: number,
  ): Promise<void> {
    const subject = 'Pedido confirmado — Vintage.br';
    const html = this.buildHtml(`
      <h1 style="color: #333; font-size: 24px; margin-bottom: 16px;">Pedido confirmado!</h1>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        Olá, ${this.escapeHtml(name)}! Seu pedido foi realizado com sucesso.
      </p>
      <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 24px 0;">
        <p style="color: #333; font-size: 16px; margin: 4px 0;"><strong>Pedido:</strong> ${this.escapeHtml(orderId)}</p>
        <p style="color: #333; font-size: 16px; margin: 4px 0;"><strong>Total:</strong> ${this.formatBrl(totalBrl)}</p>
      </div>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        Acompanhe o status do seu pedido diretamente no app Vintage.br.
      </p>
    `);

    await this.send(to, subject, html);
  }

  async sendShippingNotification(
    to: string,
    name: string,
    orderId: string,
    trackingCode: string,
    carrier: string,
  ): Promise<void> {
    const subject = 'Seu pedido foi enviado! — Vintage.br';
    const html = this.buildHtml(`
      <h1 style="color: #333; font-size: 24px; margin-bottom: 16px;">Seu pedido está a caminho!</h1>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        Olá, ${this.escapeHtml(name)}! O vendedor enviou seu pedido.
      </p>
      <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 24px 0;">
        <p style="color: #333; font-size: 16px; margin: 4px 0;"><strong>Pedido:</strong> ${this.escapeHtml(orderId)}</p>
        <p style="color: #333; font-size: 16px; margin: 4px 0;"><strong>Transportadora:</strong> ${this.escapeHtml(carrier)}</p>
        <p style="color: #333; font-size: 16px; margin: 4px 0;"><strong>Código de rastreio:</strong> ${this.escapeHtml(trackingCode)}</p>
      </div>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        Use o código de rastreio para acompanhar a entrega.
      </p>
    `);

    await this.send(to, subject, html);
  }

  async sendPaymentReceived(
    to: string,
    name: string,
    orderId: string,
    amountBrl: number,
  ): Promise<void> {
    const subject = 'Pagamento recebido — Vintage.br';
    const html = this.buildHtml(`
      <h1 style="color: #333; font-size: 24px; margin-bottom: 16px;">Pagamento recebido!</h1>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        Olá, ${this.escapeHtml(name)}! O pagamento da sua venda foi creditado na sua carteira.
      </p>
      <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 24px 0;">
        <p style="color: #333; font-size: 16px; margin: 4px 0;"><strong>Pedido:</strong> ${this.escapeHtml(orderId)}</p>
        <p style="color: #333; font-size: 16px; margin: 4px 0;"><strong>Valor:</strong> ${this.formatBrl(amountBrl)}</p>
      </div>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        O valor já está disponível na sua carteira Vintage.br.
      </p>
    `);

    await this.send(to, subject, html);
  }

  async sendDeletionConfirmationCode(
    to: string,
    name: string,
    code: string,
  ): Promise<void> {
    const subject = 'Código de confirmação — Exclusão da conta Vintage.br';
    const html = this.buildHtml(`
      <h1 style="color: #333; font-size: 24px; margin-bottom: 16px;">Olá, ${this.escapeHtml(name)}</h1>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        Recebemos uma solicitação para excluir sua conta Vintage.br. Para confirmar, use o código abaixo dentro de 15 minutos:
      </p>
      <div style="background-color: #f9f9f9; padding: 24px; border-radius: 8px; margin: 24px 0; text-align: center;">
        <p style="color: #e91e63; font-size: 32px; letter-spacing: 8px; font-weight: bold; margin: 0;">
          ${this.escapeHtml(code)}
        </p>
      </div>
      <p style="color: #555; font-size: 14px; line-height: 1.6;">
        Se você não solicitou essa exclusão, ignore este email. Sua conta permanecerá ativa.
      </p>
    `);

    await this.send(to, subject, html);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    try {
      if (this.isDev || !this.transporter) {
        this.logger.log(
          `[EMAIL DEV] Para: ${to} | Assunto: ${subject}\n${html}`,
        );
        return;
      }

      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject,
        html,
      });
      this.logger.log(`Email enviado para ${to}: ${subject}`);
    } catch (error) {
      this.logger.error(
        `Falha ao enviar email para ${to}: ${String(error).slice(0, 200)}`,
      );
    }
  }

  private buildHtml(content: string): string {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8" /></head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px;">
    <div style="text-align: center; margin-bottom: 32px;">
      <h2 style="color: #e91e63; font-size: 28px; margin: 0;">Vintage.br</h2>
    </div>
    ${content}
    <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
    <p style="color: #999; font-size: 12px; text-align: center; line-height: 1.6;">
      Este email foi enviado por Vintage.br. Se você não esperava receber este email, por favor ignore-o.
    </p>
  </div>
</body>
</html>`;
  }

  private formatBrl(value: number): string {
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
