/**
 * Durable, crash-safe fetch queue.
 *
 * Backed by `crawl_queue` in SQLite so a restart never loses in-flight work.
 * Responsibilities:
 *   - dedup: the same canonical URL is never queued twice while pending/leased
 *     (enforced by a partial UNIQUE index; enqueue is idempotent)
 *   - priority: lower `priority` number leases first
 *   - retry scheduling: `not_before` gates a URL until its backoff elapses
 *   - leasing: a worker leases a row for `leaseMs`; a crashed worker's lease
 *     expires and the row becomes leasable again (no lost work, no double work)
 *   - dead-lettering: once attempts hit max_attempts the row is marked 'dead'
 */

import type Database from 'better-sqlite3';
import { normalizeUrl } from './urlNormalizer.js';
import { backoffMs, ErrorClass } from './retry.js';

export interface EnqueueInput {
  platformId: string;
  url: string;
  priority?: number;
  maxAttempts?: number;
  payload?: Record<string, unknown>;
}

export interface LeasedTask {
  id: number;
  platformId: string;
  url: string;
  canonicalUrl: string;
  attempts: number;
  maxAttempts: number;
  payload: Record<string, unknown>;
}

export class CrawlQueue {
  constructor(private db: Database.Database, private defaultLeaseMs = 60_000) {}

  /** Idempotent enqueue. Returns the row id (existing or new), or null for a
   *  non-fetchable URL. A duplicate pending/leased URL returns the existing id. */
  enqueue(input: EnqueueInput): number | null {
    const norm = normalizeUrl(input.url);
    if (!norm) return null;

    const existing = this.db.prepare(
      `SELECT id FROM crawl_queue WHERE dedup_key = ? AND status IN ('pending','leased')`,
    ).get(norm.dedupKey) as { id: number } | undefined;
    if (existing) return existing.id;

    const info = this.db.prepare(`
      INSERT INTO crawl_queue (dedup_key, platform_id, url, canonical_url, priority, max_attempts, not_before, payload_json)
      VALUES (?,?,?,?,?,?,0,?)
    `).run(
      norm.dedupKey, input.platformId, input.url, norm.canonical,
      input.priority ?? 100, input.maxAttempts ?? 4, JSON.stringify(input.payload ?? {}),
    );
    return Number(info.lastInsertRowid);
  }

  enqueueMany(inputs: EnqueueInput[]): { queued: number; deduped: number; invalid: number } {
    let queued = 0, deduped = 0, invalid = 0;
    const tx = this.db.transaction(() => {
      for (const input of inputs) {
        const norm = normalizeUrl(input.url);
        if (!norm) { invalid++; continue; }
        const before = this.db.prepare(
          `SELECT id FROM crawl_queue WHERE dedup_key = ? AND status IN ('pending','leased')`,
        ).get(norm.dedupKey);
        if (before) { deduped++; continue; }
        this.enqueue(input);
        queued++;
      }
    });
    tx();
    return { queued, deduped, invalid };
  }

  /** Lease the next ready task (highest priority, past its backoff gate). Also
   *  reclaims tasks whose previous lease expired. Returns null when idle. */
  lease(now = Date.now(), leaseMs = this.defaultLeaseMs): LeasedTask | null {
    const row = this.db.prepare(`
      SELECT * FROM crawl_queue
      WHERE (status = 'pending' AND not_before <= ?)
         OR (status = 'leased' AND lease_until IS NOT NULL AND lease_until < ?)
      ORDER BY priority ASC, id ASC
      LIMIT 1
    `).get(now, now) as any;
    if (!row) return null;

    this.db.prepare(`
      UPDATE crawl_queue SET status='leased', lease_until=?, attempts=attempts+1, updated_at=datetime('now')
      WHERE id=?
    `).run(now + leaseMs, row.id);

    return {
      id: row.id,
      platformId: row.platform_id,
      url: row.url,
      canonicalUrl: row.canonical_url,
      attempts: row.attempts + 1,
      maxAttempts: row.max_attempts,
      payload: JSON.parse(row.payload_json || '{}'),
    };
  }

  /** Mark a leased task successfully done. */
  complete(id: number): void {
    this.db.prepare(`UPDATE crawl_queue SET status='done', lease_until=NULL, updated_at=datetime('now') WHERE id=?`).run(id);
  }

  /**
   * Report a failed attempt. If the error is retryable and attempts remain, the
   * task is re-armed with a backoff gate; otherwise it is dead-lettered.
   * Returns the disposition so the caller can record metrics.
   */
  fail(task: LeasedTask, cls: ErrorClass, message: string): 'retry' | 'dead' {
    const retryable = cls === 'rate_limited' || cls === 'blocked' || cls === 'server_error' || cls === 'network';
    if (retryable && task.attempts < task.maxAttempts) {
      const gate = Date.now() + backoffMs(task.attempts, cls);
      this.db.prepare(`
        UPDATE crawl_queue SET status='pending', lease_until=NULL, not_before=?, last_error=?, last_error_class=?, updated_at=datetime('now')
        WHERE id=?
      `).run(gate, message.slice(0, 500), cls, task.id);
      return 'retry';
    }
    this.db.prepare(`
      UPDATE crawl_queue SET status='dead', lease_until=NULL, last_error=?, last_error_class=?, updated_at=datetime('now')
      WHERE id=?
    `).run(message.slice(0, 500), cls, task.id);
    return 'dead';
  }

  deadLetterCount(): number {
    return (this.db.prepare(`SELECT COUNT(*) n FROM crawl_queue WHERE status='dead'`).get() as any).n;
  }

  stats() {
    const rows = this.db.prepare(`SELECT status, COUNT(*) n FROM crawl_queue GROUP BY status`).all() as
      { status: string; n: number }[];
    const m: Record<string, number> = {};
    for (const r of rows) m[r.status] = r.n;
    return {
      pending: m.pending ?? 0,
      leased: m.leased ?? 0,
      done: m.done ?? 0,
      failed: m.failed ?? 0,
      dead: m.dead ?? 0,
    };
  }

  /** Requeue dead-lettered tasks (operator action after fixing a template/proxy). */
  requeueDead(platformId?: string): number {
    const sql = platformId
      ? `UPDATE crawl_queue SET status='pending', attempts=0, not_before=0, lease_until=NULL WHERE status='dead' AND platform_id=?`
      : `UPDATE crawl_queue SET status='pending', attempts=0, not_before=0, lease_until=NULL WHERE status='dead'`;
    const info = platformId ? this.db.prepare(sql).run(platformId) : this.db.prepare(sql).run();
    return info.changes;
  }

  /** Purge terminal rows older than `olderThanMs` to keep the table small. */
  purgeCompleted(olderThanMs = 24 * 60 * 60_000): number {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString().replace('T', ' ').slice(0, 19);
    const info = this.db.prepare(`DELETE FROM crawl_queue WHERE status='done' AND updated_at < ?`).run(cutoff);
    return info.changes;
  }
}
