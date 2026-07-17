/**
 * Connector framework.
 *
 * Every platform integration implements this one interface. The orchestrator
 * only ever talks to `Connector` — it never knows whether the data came from a
 * real API, an MCP gateway, or (in demo mode) a deterministic simulator. That
 * separation is what lets us wire 30+ platforms without 30+ bespoke pipelines.
 *
 * DEMO MODE: with no real credentials the connector returns realistic,
 * deterministic synthetic data (seeded off the company name) so the entire
 * system is demonstrable end-to-end. Flip DEMO=false + provide keys and the
 * same connector calls the live API — nothing else in the system changes.
 */

import crypto from 'node:crypto';
import type { AccountRow } from '../core/pool.js';

export interface EnrichInput {
  company: string;
  domain?: string;
  contactName?: string;
  title?: string;
}

export interface EnrichOutput {
  email?: string;
  emailStatus?: 'verified' | 'risky' | 'unknown';
  phone?: string;
  linkedin?: string;
  industry?: string;
  employeeCount?: number;
  location?: string;
  /** Free-text evidence blobs the signal detector scans (roles, news, tech). */
  evidence: string[];
  rateLimited?: boolean;
}

export interface Connector {
  platformId: string;
  enrich(input: EnrichInput, account: AccountRow | null): Promise<EnrichOutput>;
}

/** Deterministic 0-1 hash so demo data is stable per company across runs. */
export function seededRand(...parts: string[]): number {
  const h = crypto.createHash('md5').update(parts.join('|')).digest();
  return h.readUInt32BE(0) / 0xffffffff;
}

export function pick<T>(seed: number, arr: T[]): T {
  return arr[Math.floor(seed * arr.length) % arr.length];
}

export const DEMO = process.env.LIVE_MODE !== 'true';
