/**
 * Response cache + duplicate-page detection.
 *
 * Cache: keyed by canonical URL with a per-platform TTL. A fresh hit skips the
 * fetch entirely — the single biggest lever for both speed and politeness
 * (fewer requests = fewer bans). Backed by SQLite so it survives restarts and is
 * shared across all in-process workers.
 *
 * Dedup: every fetched body yields a content hash. If we've seen that exact hash
 * before (under any URL), the page is a duplicate — useful for skipping mirror
 * pages, paginated dupes, and "soft 404" templates that render identically.
 */

import type Database from 'better-sqlite3';
import { contentHash } from './urlNormalizer.js';

/** Per-platform cache TTLs (ms). Volatile sources (job boards, social) expire
 *  fast; stable directory/record pages can live much longer. */
const TTL_DEFAULT = 6 * 60 * 60_000; // 6h
const TTL_BY_PLATFORM: Record<string, number> = {
  linkedin: 60 * 60_000,          // 1h — postings churn
  'google-search': 30 * 60_000,   // 30m — SERP volatility
  google_search: 30 * 60_000,
  glassdoor: 3 * 60 * 60_000,     // 3h
  ycombinator: 24 * 60 * 60_000,  // 24h — directory is stable
  crunchbase: 12 * 60 * 60_000,
  sec_edgar: 24 * 60 * 60_000,
  builtwith: 24 * 60 * 60_000,
};

export function ttlFor(platformId: string): number {
  return TTL_BY_PLATFORM[platformId] ?? TTL_DEFAULT;
}

export interface CachedResponse {
  canonicalUrl: string;
  platformId: string;
  statusCode: number | null;
  contentHash: string;
  body: string | null;
  headers: Record<string, string>;
  fetchedAt: number;
  expiresAt: number;
  fresh: boolean;
}

export class CrawlCache {
  constructor(private db: Database.Database) {}

  /** Return a cached entry for the canonical URL, or null. `fresh` says whether
   *  it is still within TTL; a stale entry can still be useful as a fallback. */
  get(canonicalUrl: string): CachedResponse | null {
    const row = this.db.prepare(`SELECT * FROM crawl_cache WHERE canonical_url = ?`).get(canonicalUrl) as any;
    if (!row) return null;
    this.db.prepare(`UPDATE crawl_cache SET hits = hits + 1 WHERE canonical_url = ?`).run(canonicalUrl);
    return {
      canonicalUrl: row.canonical_url,
      platformId: row.platform_id,
      statusCode: row.status_code,
      contentHash: row.content_hash,
      body: row.body,
      headers: JSON.parse(row.headers_json || '{}'),
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at,
      fresh: row.expires_at > Date.now(),
    };
  }

  /** Store a fetched response and update the seen-content dedup index. Returns
   *  whether this content hash was seen before (i.e. duplicate page). */
  put(entry: {
    canonicalUrl: string;
    platformId: string;
    statusCode: number;
    body: string;
    headers?: Record<string, string>;
  }): { duplicate: boolean; contentHash: string } {
    const hash = contentHash(entry.body);
    const now = Date.now();
    const expiresAt = now + ttlFor(entry.platformId);

    this.db.prepare(`
      INSERT INTO crawl_cache (canonical_url, platform_id, status_code, content_hash, body, headers_json, fetched_at, expires_at, hits)
      VALUES (?,?,?,?,?,?,?,?,0)
      ON CONFLICT(canonical_url) DO UPDATE SET
        status_code=excluded.status_code, content_hash=excluded.content_hash, body=excluded.body,
        headers_json=excluded.headers_json, fetched_at=excluded.fetched_at, expires_at=excluded.expires_at
    `).run(
      entry.canonicalUrl, entry.platformId, entry.statusCode, hash, entry.body,
      JSON.stringify(entry.headers ?? {}), now, expiresAt,
    );

    const seen = this.db.prepare(`SELECT first_url, seen_count FROM crawl_seen_content WHERE content_hash = ?`).get(hash) as
      | { first_url: string; seen_count: number } | undefined;

    if (seen) {
      this.db.prepare(`UPDATE crawl_seen_content SET seen_count = seen_count + 1, last_seen_at = ? WHERE content_hash = ?`)
        .run(now, hash);
      // Duplicate only if the earlier sighting was a *different* URL.
      return { duplicate: seen.first_url !== entry.canonicalUrl, contentHash: hash };
    }

    this.db.prepare(`INSERT INTO crawl_seen_content (content_hash, first_url, platform_id, seen_count, first_seen_at, last_seen_at)
      VALUES (?,?,?,1,?,?)`).run(hash, entry.canonicalUrl, entry.platformId, now, now);
    return { duplicate: false, contentHash: hash };
  }

  /** Best-effort eviction of expired rows. Call periodically. */
  evictExpired(): number {
    const info = this.db.prepare(`DELETE FROM crawl_cache WHERE expires_at < ?`).run(Date.now());
    return info.changes;
  }

  stats() {
    const total = (this.db.prepare(`SELECT COUNT(*) n FROM crawl_cache`).get() as any).n;
    const fresh = (this.db.prepare(`SELECT COUNT(*) n FROM crawl_cache WHERE expires_at > ?`).get(Date.now()) as any).n;
    const dupes = (this.db.prepare(`SELECT COUNT(*) n FROM crawl_seen_content WHERE seen_count > 1`).get() as any).n;
    return { entries: total, fresh, stale: total - fresh, duplicateContentGroups: dupes };
  }
}
