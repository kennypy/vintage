import { BadRequestException, Logger } from '@nestjs/common';
import { promises as dns } from 'dns';

const PRIVATE_IP_RANGES = [
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,           // 127.0.0.0/8 (loopback)
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,           // 10.0.0.0/8 (private)
  /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/, // 172.16.0.0/12 (private)
  /^192\.168\.\d{1,3}\.\d{1,3}$/,              // 192.168.0.0/16 (private)
  /^169\.254\.\d{1,3}\.\d{1,3}$/,              // 169.254.0.0/16 (link-local)
  /^fc[0-9a-f]{2}:/i,                          // fc00::/7 (IPv6 unique local)
  /^fe80:/i,                                   // fe80::/10 (IPv6 link-local)
  /^::1$/,                                     // ::1 (IPv6 loopback)
  /^\[::\]$/,                                  // :: (IPv6 any)
];

export class UrlValidator {
  private static readonly logger = new Logger('UrlValidator');
  private static readonly DNS_TIMEOUT = 3000; // ms

  static validateUrl(urlString: string): URL {
    try {
      const url = new URL(urlString);

      // Validate scheme
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new BadRequestException(
          `Invalid URL scheme: ${url.protocol}. Only http and https are allowed.`,
        );
      }

      return url;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Invalid URL: ${String(error).slice(0, 100)}`);
    }
  }

  static async validateAndResolveUrl(urlString: string): Promise<{ url: URL; resolvedIp: string }> {
    const url = this.validateUrl(urlString);

    try {
      const resolvedIp = await this.resolveDnsWithTimeout(url.hostname);
      this.validateIpNotPrivate(resolvedIp);

      return { url, resolvedIp };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.warn(`DNS resolution failed for ${url.hostname}: ${String(error).slice(0, 100)}`);
      throw new BadRequestException(
        `Could not resolve hostname: ${url.hostname}. DNS lookup failed or hostname is invalid.`,
      );
    }
  }

  private static async resolveDnsWithTimeout(hostname: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.DNS_TIMEOUT);

    try {
      const addresses = await dns.resolve4(hostname);
      clearTimeout(timeoutId);

      if (!addresses || addresses.length === 0) {
        throw new Error('No addresses resolved');
      }

      return addresses[0];
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private static validateIpNotPrivate(ip: string): void {
    for (const pattern of PRIVATE_IP_RANGES) {
      if (pattern.test(ip)) {
        this.logger.warn(`Attempted access to private IP: ${ip}`);
        throw new BadRequestException(
          `SSRF protection: private IP addresses are not allowed (${ip}).`,
        );
      }
    }
  }
}
