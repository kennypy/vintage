import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as crypto from 'crypto';

/**
 * Rate limiter that keys buckets by SHA-256 hash of the full API key
 * when X-API-Key is present, falling back to the remote IP address.
 * This prevents cross-user bucket collisions caused by prefix-based keys.
 */
@Injectable()
export class HashThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const headers = req['headers'] as Record<string, string> | undefined;
    const apiKey = headers?.['x-api-key'];

    if (apiKey) {
      return crypto.createHash('sha256').update(apiKey).digest('hex');
    }

    // Fall back to IP address
    const ip =
      (req['ip'] as string | undefined) ??
      ((req['connection'] as { remoteAddress?: string } | undefined)
        ?.remoteAddress) ??
      'unknown';
    return ip;
  }
}
