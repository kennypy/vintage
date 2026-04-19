import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * CPF is a government-issued Brazilian tax-ID. Storing it plaintext in
 * Postgres is a reportable-incident material under LGPD (Art. 5 II) if
 * the DB is dumped. This vault keeps the raw CPF off the database row:
 *
 *   * `encrypt(cpf)` returns an AES-256-GCM ciphertext that the DB can
 *     hold. A leaked row is only valuable with the key.
 *   * `decrypt(ciphertext)` rehydrates the raw CPF for paths that
 *     genuinely need it (identity verification against Serpro / Caf,
 *     NF-e generation, the owner's own /users/me response).
 *   * `lookupHash(cpf)` returns an HMAC-SHA256 the DB can index
 *     unique'ly, so CPF-collision checks at registration don't need
 *     to decrypt every row. A leaked hash is also not reversible
 *     without the HMAC key (separate from the encryption key, so a
 *     compromise of one doesn't bootstrap the other).
 *
 * Key material:
 *   CPF_ENCRYPTION_KEY — 32 bytes (64 hex chars). Used as the AES-256
 *                        key for envelope encryption of the CPF itself.
 *   CPF_LOOKUP_KEY     — 32 bytes (64 hex chars). Used as the HMAC
 *                        key for the deterministic lookup hash.
 *
 * Both are required in production; non-prod falls back to per-process
 * ephemeral random keys so tests + dev don't need real config, but
 * ANY encrypted value written in one dev session cannot be decrypted
 * by the next (ephemeral key). That's the correct UX — it forces a
 * reset rather than silently leaking encrypted goo that nobody can
 * read.
 */
@Injectable()
export class CpfVaultService {
  private readonly logger = new Logger(CpfVaultService.name);
  private readonly encKey: Buffer;
  private readonly lookupKey: Buffer;

  constructor(config: ConfigService) {
    const nodeEnv = config.get<string>('NODE_ENV', 'development');
    const rawEnc = config.get<string>('CPF_ENCRYPTION_KEY', '');
    const rawLookup = config.get<string>('CPF_LOOKUP_KEY', '');

    if (nodeEnv === 'production') {
      if (!rawEnc || !rawLookup) {
        throw new Error(
          'CPF_ENCRYPTION_KEY and CPF_LOOKUP_KEY must be set in production (64 hex chars each).',
        );
      }
      if (rawEnc === rawLookup) {
        throw new Error(
          'CPF_ENCRYPTION_KEY and CPF_LOOKUP_KEY must be different — using the same value defeats the defence-in-depth separation.',
        );
      }
    }

    this.encKey = this.parseKey(rawEnc, 'CPF_ENCRYPTION_KEY', nodeEnv);
    this.lookupKey = this.parseKey(rawLookup, 'CPF_LOOKUP_KEY', nodeEnv);
  }

  private parseKey(raw: string, name: string, nodeEnv: string): Buffer {
    if (raw) {
      if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
        throw new Error(
          `${name} must be exactly 64 hex characters (32 bytes). Run \`openssl rand -hex 32\` to generate.`,
        );
      }
      return Buffer.from(raw, 'hex');
    }
    // Non-prod fallback: per-process random key. Encrypted values
    // don't survive a restart — correct behaviour in dev.
    this.logger.warn(
      `${name} not configured — using ephemeral per-process key (dev only, encrypted values will NOT survive restart).`,
    );
    if (nodeEnv === 'production') {
      throw new Error(`${name} missing in production.`);
    }
    return crypto.randomBytes(32);
  }

  /**
   * Encrypt an 11-digit CPF. Returns an opaque string suitable for a
   * text column. Format: `v1:<iv-base64>:<tag-base64>:<ciphertext-base64>`.
   * The `v1:` prefix lets a future key-rotation or algorithm change
   * identify the blob's format without guessing.
   */
  encrypt(cpfPlain: string): string {
    if (!cpfPlain || typeof cpfPlain !== 'string') {
      throw new Error('CpfVault.encrypt: plaintext must be a non-empty string.');
    }
    const iv = crypto.randomBytes(12); // AES-GCM standard nonce size
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encKey, iv);
    const enc = Buffer.concat([cipher.update(cpfPlain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
  }

  /** Decrypt a blob produced by encrypt(). Throws on tamper / wrong key. */
  decrypt(ciphertext: string): string {
    if (!ciphertext || typeof ciphertext !== 'string') {
      throw new Error('CpfVault.decrypt: ciphertext must be a non-empty string.');
    }
    const parts = ciphertext.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new Error('CpfVault.decrypt: unknown ciphertext format.');
    }
    const [, ivB64, tagB64, encB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const enc = Buffer.from(encB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encKey, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  }

  /**
   * Deterministic, index-able lookup hash. Same CPF in → same hash
   * out, different key class from encryption so the two leak paths
   * don't compound. SHA-256 → 64 hex chars.
   */
  lookupHash(cpfPlain: string): string {
    if (!cpfPlain || typeof cpfPlain !== 'string') {
      throw new Error('CpfVault.lookupHash: plaintext must be a non-empty string.');
    }
    return crypto.createHmac('sha256', this.lookupKey).update(cpfPlain).digest('hex');
  }
}
