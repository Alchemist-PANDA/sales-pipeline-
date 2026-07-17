/**
 * ============================================================================
 *  ACCOUNT-POOL ROUTER  —  the throughput "magic"
 * ============================================================================
 *
 *  The whole reason this system exists: manually finding signals for 100
 *  leads/day is brutal on one account. With 30 teammates each holding an
 *  account per platform, we get up to 30× the quota — but only if calls are
 *  routed intelligently across the pool instead of hammering one account.
 *
 *  This router picks, for a given platform, the BEST account to use right now:
 *    1. owner must be ACTIVE (reserved owners are wired but held offline)
 *    2. account must be healthy (not cooling down / not exhausted)
 *    3. among candidates, pick the least-recently-used with quota remaining
 *       (round-robin by last_used_at) → spreads load evenly, avoids rate caps
 *
 *  When an account hits a rate limit we "cool it down" (temporary bench) and
 *  the router transparently falls through to the next healthy account. The
 *  caller never has to know which of the 30 accounts served the request.
 */

import type Database from 'better-sqlite3';

export interface AccountRow {
  id: number;
  owner_id: number;
  owner_name: string;
  owner_status: 'active' | 'reserved';
  platform_id: string;
  label: string;
  status: 'connected' | 'error' | 'disconnected';
  quota_limit: number;
  quota_used: number;
  quota_reset_at: string;
  cooldown_until: string | null;
  health: number; // 0-100
  last_used_at: string | null;
}

export interface LeaseResult {
  account: AccountRow;
  release: (ok: boolean, meta?: { rateLimited?: boolean; creditsUsed?: number }) => void;
}

export class AccountPool {
  constructor(private db: Database.Database) {}

  /** How many live vs. reserved accounts back a platform (for the UI). */
  capacity(platformId: string) {
    const rows = this.db
      .prepare(
        `SELECT o.status as owner_status, a.status as acct_status
           FROM accounts a JOIN owners o ON o.id = a.owner_id
          WHERE a.platform_id = ?`,
      )
      .all(platformId) as { owner_status: string; acct_status: string }[];
    const live = rows.filter((r) => r.owner_status === 'active' && r.acct_status === 'connected').length;
    const reserved = rows.filter((r) => r.owner_status === 'reserved').length;
    return { live, reserved, total: rows.length };
  }

  /**
   * Lease the best available account for a platform. Returns null if the whole
   * pool for that platform is exhausted / cooling down (caller then waterfalls
   * to the next provider).
   */
  lease(platformId: string): LeaseResult | null {
    const now = new Date().toISOString();
    // Reset any accounts whose monthly quota window rolled over.
    this.db
      .prepare(
        `UPDATE accounts SET quota_used = 0,
             quota_reset_at = datetime('now','+30 days')
         WHERE platform_id = ? AND quota_reset_at < ?`,
      )
      .run(platformId, now);

    const candidate = this.db
      .prepare(
        `SELECT a.*, o.name as owner_name, o.status as owner_status
           FROM accounts a JOIN owners o ON o.id = a.owner_id
          WHERE a.platform_id = ?
            AND o.status = 'active'
            AND a.status = 'connected'
            AND a.quota_used < a.quota_limit
            AND (a.cooldown_until IS NULL OR a.cooldown_until < ?)
          ORDER BY a.last_used_at IS NOT NULL, a.last_used_at ASC, a.health DESC
          LIMIT 1`,
      )
      .get(platformId, now) as AccountRow | undefined;

    if (!candidate) return null;

    // Optimistically mark it in-use so concurrent leases pick a different one.
    this.db
      .prepare(`UPDATE accounts SET last_used_at = ? WHERE id = ?`)
      .run(now, candidate.id);

    const release: LeaseResult['release'] = (ok, meta = {}) => {
      const credits = meta.creditsUsed ?? 1;
      if (meta.rateLimited) {
        // Bench this account for 15 minutes and dent its health.
        this.db
          .prepare(
            `UPDATE accounts
                SET cooldown_until = datetime('now','+15 minutes'),
                    health = MAX(0, health - 15)
              WHERE id = ?`,
          )
          .run(candidate.id);
      } else if (ok) {
        this.db
          .prepare(
            `UPDATE accounts
                SET quota_used = quota_used + ?,
                    health = MIN(100, health + 1),
                    status = 'connected'
              WHERE id = ?`,
          )
          .run(credits, candidate.id);
      } else {
        this.db
          .prepare(`UPDATE accounts SET health = MAX(0, health - 5) WHERE id = ?`)
          .run(candidate.id);
      }
    };

    return { account: candidate, release };
  }

  /** Aggregate pool health across every platform (dashboard tile). */
  overview() {
    return this.db
      .prepare(
        `SELECT a.platform_id,
                COUNT(*) as accounts,
                SUM(CASE WHEN o.status='active' AND a.status='connected' THEN 1 ELSE 0 END) as live,
                SUM(a.quota_limit) as quota_limit,
                SUM(a.quota_used) as quota_used,
                AVG(a.health) as health
           FROM accounts a JOIN owners o ON o.id = a.owner_id
          GROUP BY a.platform_id`,
      )
      .all();
  }
}
