import { Logger } from '@nestjs/common';

const SENSITIVE_PATTERNS = [
  /password["':=\s]+[^\s,}]+/gi,
  /token["':=\s]+[^\s,}]+/gi,
  /secret["':=\s]+[^\s,}]+/gi,
  /cpf["':=\s]+[^\s,}]+/gi,
  /authorization["':=\s]+[^\s,}]+/gi,
  /api.?key["':=\s]+[^\s,}]+/gi,
  /pix.?key["':=\s]+[^\s,}]+/gi,
  /mercadopago["':=\s]+[^\s,}]+/gi,
  /jwt["':=\s]+[^\s,}]+/gi,
];

export class Sanitizer {
  private static readonly logger = new Logger('Sanitizer');

  static redactSensitiveData(value: unknown): string {
    if (!value) return '';

    let str = String(value);
    for (const pattern of SENSITIVE_PATTERNS) {
      str = str.replace(pattern, '[REDACTED]');
    }
    return str;
  }

  static sanitizeString(input: string): string {
    if (!input) return '';
    // eslint-disable-next-line no-control-regex
    return input.replace(/\0/g, '').replace(/[\x01-\x1F\x7F]/g, '').trim();
  }

  static sanitizeObject(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    if (typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.sanitizeObject(value);
      }
      return sanitized;
    }

    return obj;
  }

  static maskCpf(cpf: string): string {
    if (!cpf || cpf.length < 11) return '[INVALID_CPF]';
    return `${cpf.substring(0, 3)}.***.***-${cpf.substring(9)}`;
  }

  static maskEmail(email: string): string {
    if (!email || !email.includes('@')) return '[INVALID_EMAIL]';
    const [local, domain] = email.split('@');
    const masked = `${local[0]}***@${domain}`;
    return masked;
  }

  static maskToken(token: string): string {
    if (!token || token.length < 10) return '[INVALID_TOKEN]';
    return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
  }

  static logWithRedaction(message: string, data?: unknown): void {
    let logMessage = message;
    if (data) {
      const redacted = this.redactSensitiveData(JSON.stringify(data));
      logMessage = `${message}: ${redacted}`;
    }
    this.logger.debug(logMessage);
  }

  static errorWithRedaction(message: string, _error?: unknown): void {
    this.logger.error(message);
  }
}
