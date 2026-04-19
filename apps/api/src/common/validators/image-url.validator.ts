import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

/**
 * Shared image-URL allowlist used by anything that accepts an
 * S3/CDN image URL from the client (listing photos, authenticity
 * proofs). Centralised here so a single ops change to
 * ALLOWED_IMAGE_HOSTS reaches every surface that writes image URLs
 * to the database — previously only listings validated, and pen-test
 * follow-up P-12 found that authenticity proof URLs were accepted
 * verbatim.
 */

/** Default allowlist when ALLOWED_IMAGE_HOSTS env is not configured. */
const DEFAULT_ALLOWED_IMAGE_HOSTS = [
  'picsum.photos', // dev placeholder
  's3.amazonaws.com', // generic AWS S3
];

/**
 * Build the allowed-host list from config. Auto-includes the configured
 * S3 bucket's virtual-hosted-style and path-style hostnames so the
 * default deployment just works.
 */
export function buildAllowedImageHosts(config: ConfigService): string[] {
  const raw = config.get<string>('ALLOWED_IMAGE_HOSTS', '');
  const bucket = config.get<string>('S3_BUCKET', '');
  const region = config.get<string>('S3_REGION', '');
  const hosts = raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  if (bucket && region) {
    hosts.push(`${bucket}.s3.${region}.amazonaws.com`);
    hosts.push(`${bucket}.s3.amazonaws.com`);
    hosts.push(`s3.${region}.amazonaws.com`);
  }
  if (hosts.length === 0) {
    hosts.push(...DEFAULT_ALLOWED_IMAGE_HOSTS);
  }
  return Array.from(new Set(hosts));
}

/** Throws BadRequestException if the URL is not on the allowlist. */
export function validateImageUrl(url: string, allowed: string[]): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('URL de imagem inválida.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BadRequestException('Protocolo de URL de imagem não permitido.');
  }
  const host = parsed.hostname.toLowerCase();
  const ok = allowed.some(
    (a) => host === a || host.endsWith(`.${a}`),
  );
  if (!ok) {
    throw new BadRequestException(
      `Domínio de imagem não permitido: ${host}`,
    );
  }
}
