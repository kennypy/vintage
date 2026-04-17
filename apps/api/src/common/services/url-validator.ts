import { BadRequestException } from '@nestjs/common';
import * as dns from 'dns';
import * as net from 'net';

/**
 * Centralized URL / hostname validation helpers used across the API
 * to defend against SSRF (Server-Side Request Forgery) attacks.
 *
 * Attack vectors defended against:
 *   - Cloud metadata endpoints (AWS 169.254.169.254, GCP metadata.google.internal)
 *   - Loopback (127.0.0.1, ::1, localhost)
 *   - Private networks (RFC 1918, link-local, CGNAT)
 *   - DNS rebinding — callers must re-validate after resolution at request time.
 */

export const ALLOWED_URL_SCHEMES = ['http:', 'https:'];

export const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '::',
  'metadata.google.internal',
  'metadata',
  '169.254.169.254',
]);

/**
 * Checks an IP string against private/loopback/link-local/reserved ranges.
 * Accepts both IPv4 and IPv6 (loopback only for v6).
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (!ip) return true; // refuse unresolved hostnames
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    // IPv4-mapped IPv6 -> fall through to IPv4 check
    const mapped = lower.match(/^::ffff:([\d.]+)$/);
    if (mapped) return isPrivateOrReservedIp(mapped[1]);
    // Unique local (fc00::/7), link local (fe80::/10)
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
    return false;
  }
  if (!net.isIPv4(ip)) return true;
  const [a, b] = ip.split('.').map((n) => parseInt(n, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  // 0.0.0.0/8
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 loopback
  if (a === 127) return true;
  // 169.254.0.0/16 link-local (includes AWS/GCP metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 100.64.0.0/10 CGNAT
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 TEST-NET
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
  if (a === 203 && b === 0) return true;
  // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved
  if (a >= 224) return true;
  return false;
}

/** Synchronous hostname-only validation — catches literal IPs and known bad names. */
export function isBlockedHostnameLiteral(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (net.isIP(h)) return isPrivateOrReservedIp(h);
  return false;
}

/**
 * Full URL validation: scheme + hostname + DNS resolution (optional, async).
 * When `resolve` is true, the hostname is resolved to all A/AAAA records and
 * EVERY resolved IP must be public. This protects against DNS rebinding.
 *
 * Throws BadRequestException on any failure.
 */
export async function assertSafeUrl(raw: string, options: { resolve?: boolean } = {}): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BadRequestException('URL inválida.');
  }
  if (!ALLOWED_URL_SCHEMES.includes(parsed.protocol)) {
    throw new BadRequestException('Protocolo de URL não permitido.');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (isBlockedHostnameLiteral(hostname)) {
    throw new BadRequestException('Host não permitido (SSRF).');
  }
  if (options.resolve) {
    let addresses: string[];
    try {
      addresses = await dns.promises.lookup(hostname, { all: true }).then((res) => res.map((a) => a.address));
    } catch {
      throw new BadRequestException('Não foi possível resolver o host.');
    }
    if (addresses.length === 0) {
      throw new BadRequestException('Host não resolveu para nenhum endereço.');
    }
    for (const addr of addresses) {
      if (isPrivateOrReservedIp(addr)) {
        throw new BadRequestException('Host resolve para um endereço privado (SSRF).');
      }
    }
  }
  return parsed;
}

/**
 * Validate an S3 endpoint — used when S3_ENDPOINT env var points to a custom
 * endpoint (e.g. MinIO, Cloudflare R2). Rejects metadata endpoints and
 * private networks. Called at startup.
 */
export function assertSafeS3Endpoint(raw: string): void {
  if (!raw) return; // Empty endpoint = use default AWS S3 — safe
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`S3_ENDPOINT is not a valid URL: ${raw}`);
  }
  if (!ALLOWED_URL_SCHEMES.includes(parsed.protocol)) {
    throw new Error(`S3_ENDPOINT must use http or https: got ${parsed.protocol}`);
  }
  const hostname = parsed.hostname.toLowerCase();
  // Block obvious metadata / loopback / literal private IPs.
  if (isBlockedHostnameLiteral(hostname)) {
    throw new Error(
      `S3_ENDPOINT points to a blocked host (loopback, metadata, or private IP): ${hostname}`,
    );
  }
}
