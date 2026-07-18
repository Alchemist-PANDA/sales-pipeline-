/**
 * Persistence for the production crawl subsystem. All state that must survive a
 * process restart lives here: the durable fetch queue, the response cache, the
 * page-content dedup index, and the rolling metrics/alert log.
 *
 * SQLite (WAL) is intentional — a 30-person team's crawl volume fits comfortably
 * in one file, and it means zero external infra (no Redis/Kafka) while still
 * giving us crash-safe queueing and a shared cache across workers in-process.
 */

import type Database from 'better-sqlite3';

export function migrateCrawl(db: Database.Database) {
  db.exec(`
    -- Durable fetch queue. One row per URL we intend to fetch. Dedup is enforced
    -- by the UNIQUE dedup_key so the same canonical URL is never queued twice
    -- while pending.
    CREATE TABLE IF NOT EXISTS crawl_queue (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      dedup_key      TEXT NOT NULL,
      platform_id    TEXT NOT NULL,
      url            TEXT NOT NULL,
      canonical_url  TEXT NOT NULL,
      priority       INTEGER NOT NULL DEFAULT 100,   -- lower = sooner
      status         TEXT NOT NULL DEFAULT 'pending', -- pending|leased|done|failed|dead
      attempts       INTEGER NOT NULL DEFAULT 0,
      max_attempts   INTEGER NOT NULL DEFAULT 4,
      not_before     INTEGER NOT NULL DEFAULT 0,      -- epoch ms; retry backoff gate
      lease_until     INTEGER,                         -- epoch ms; worker lease expiry
      last_error     TEXT,
      last_error_class TEXT,
      payload_json   TEXT,                            -- opaque per-task context
      enqueued_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crawl_queue_dedup
      ON crawl_queue(dedup_key) WHERE status IN ('pending','leased');
    CREATE INDEX IF NOT EXISTS idx_crawl_queue_ready
      ON crawl_queue(status, priority, not_before);

    -- Response cache. Keyed by canonical URL. Stores the fetched body + a content
    -- hash so we can (a) serve fresh pages without re-fetching and (b) detect
    -- duplicate content across different URLs.
    CREATE TABLE IF NOT EXISTS crawl_cache (
      canonical_url  TEXT PRIMARY KEY,
      platform_id    TEXT NOT NULL,
      status_code    INTEGER,
      content_hash   TEXT NOT NULL,
      body           TEXT,
      headers_json   TEXT,
      fetched_at     INTEGER NOT NULL,               -- epoch ms
      expires_at     INTEGER NOT NULL,               -- epoch ms
      hits           INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_crawl_cache_hash ON crawl_cache(content_hash);
    CREATE INDEX IF NOT EXISTS idx_crawl_cache_expiry ON crawl_cache(expires_at);

    -- Seen-content index for cross-URL duplicate-page detection. A content hash
    -- maps to the first canonical URL that produced it.
    CREATE TABLE IF NOT EXISTS crawl_seen_content (
      content_hash   TEXT PRIMARY KEY,
      first_url      TEXT NOT NULL,
      platform_id    TEXT NOT NULL,
      seen_count     INTEGER NOT NULL DEFAULT 1,
      first_seen_at  INTEGER NOT NULL,
      last_seen_at   INTEGER NOT NULL
    );

    -- Rolling metrics, one row per (metric, platform, minute-bucket). Cheap to
    -- write, easy to aggregate for the monitoring endpoint.
    CREATE TABLE IF NOT EXISTS crawl_metrics (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      bucket         INTEGER NOT NULL,               -- epoch ms floored to the minute
      platform_id    TEXT NOT NULL,
      metric         TEXT NOT NULL,                  -- fetch_ok|fetch_fail|cache_hit|blocked|retry|dead|dup_page
      count          INTEGER NOT NULL DEFAULT 0,
      sum_ms         INTEGER NOT NULL DEFAULT 0,
      UNIQUE(bucket, platform_id, metric)
    );
    CREATE INDEX IF NOT EXISTS idx_crawl_metrics_bucket ON crawl_metrics(bucket);

    -- Alert log. When a monitored condition trips (block spike, dead-letter
    -- growth, proxy exhaustion) we record it here and fan out to sinks.
    CREATE TABLE IF NOT EXISTS crawl_alerts (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      severity       TEXT NOT NULL,                  -- info|warning|critical
      kind           TEXT NOT NULL,
      platform_id    TEXT,
      detail         TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_crawl_alerts_created ON crawl_alerts(created_at DESC);
  `);
}
