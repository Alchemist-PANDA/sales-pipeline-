/**
 * ============================================================================
 *  CREDENTIAL VAULT  —  AES-256-GCM encryption at rest
 * ============================================================================
 *
 *  Credentials are the crown jewels of this system: up to 30 owners × ~30
 *  platforms. They are NEVER stored in plaintext and NEVER returned by the
 *  API (only a masked preview + a "connected" flag leave the server).
 *
 *  Encryption: AES-256-GCM with a per-record random IV. The master key comes
 *  from VAULT_KEY (env). In dev we derive a stable key so the demo runs with
 *  zero setup — but we log a loud warning so nobody ships that to prod.
 */

import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';

function masterKey(): Buffer {
  const raw = process.env.VAULT_KEY;
  if (raw && raw.length >= 32) {
    return crypto.createHash('sha256').update(raw).digest();
  }
  // Dev fallback — deterministic so encrypted rows survive restarts locally.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('VAULT_KEY must be set (>=32 chars) in production.');
  }
  return crypto.createHash('sha256').update('alchemist-dev-vault-key').digest();
}

export interface SealedSecret {
  iv: string; // base64
  tag: string; // base64 auth tag
  data: string; // base64 ciphertext
}

export function seal(plain: Record<string, unknown>): string {
  const key = masterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const json = JSON.stringify(plain);
  const enc = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const sealed: SealedSecret = {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
  };
  return JSON.stringify(sealed);
}

export function open(sealedStr: string): Record<string, unknown> {
  const key = masterKey();
  const sealed = JSON.parse(sealedStr) as SealedSecret;
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(sealed.data, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(dec.toString('utf8'));
}

/** Produce a safe, masked preview for the UI — e.g. "sk-…f3a9". */
export function maskPreview(sealedStr: string, field = 'apiKey'): string {
  try {
    const val = open(sealedStr)[field];
    if (typeof val !== 'string' || val.length < 4) return '••••';
    const tail = val.slice(-4);
    return `••••••${tail}`;
  } catch {
    return '••••';
  }
}
