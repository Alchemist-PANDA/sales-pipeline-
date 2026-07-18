import type Database from 'better-sqlite3';

export function migrateSignalFirst(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS strategies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      strategy_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS crawl_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_id TEXT NOT NULL REFERENCES strategies(id),
      status TEXT NOT NULL DEFAULT 'queued',
      started_at TEXT,
      completed_at TEXT,
      events_seen INTEGER NOT NULL DEFAULT 0,
      events_kept INTEGER NOT NULL DEFAULT 0,
      companies_created INTEGER NOT NULL DEFAULT 0,
      provider_calls INTEGER NOT NULL DEFAULT 0,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      failure_reason TEXT,
      budget_snapshot TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS signal_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_id TEXT NOT NULL REFERENCES strategies(id),
      crawl_run_id INTEGER REFERENCES crawl_runs(id),
      signal_code TEXT,
      title TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_url TEXT,
      source_domain TEXT,
      published_at TEXT,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      company_name_raw TEXT,
      canonical_company_id INTEGER,
      relevance REAL NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0,
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      freshness_status TEXT NOT NULL DEFAULT 'current',
      evidence_json TEXT,
      event_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'candidate'
    );

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legal_name TEXT,
      trading_name TEXT NOT NULL,
      domain TEXT,
      linkedin_url TEXT,
      country TEXT,
      region TEXT,
      industry TEXT,
      employee_count INTEGER,
      revenue_usd REAL,
      business_model TEXT,
      technologies_json TEXT,
      aliases_json TEXT,
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      confidence REAL NOT NULL DEFAULT 0,
      provenance_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(domain)
    );

    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      title TEXT,
      department TEXT,
      seniority TEXT,
      linkedin_url TEXT,
      email TEXT,
      email_status TEXT,
      phone TEXT,
      role_in_buying_committee TEXT,
      relevance REAL NOT NULL DEFAULT 0,
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      confidence REAL NOT NULL DEFAULT 0,
      provenance_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, full_name, title)
    );

    CREATE TABLE IF NOT EXISTS lead_opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_id TEXT NOT NULL REFERENCES strategies(id),
      signal_event_id INTEGER NOT NULL REFERENCES signal_events(id),
      company_id INTEGER NOT NULL REFERENCES companies(id),
      status TEXT NOT NULL DEFAULT 'researching',
      priority_score INTEGER NOT NULL DEFAULT 0,
      icp_score REAL NOT NULL DEFAULT 0,
      intent_score REAL NOT NULL DEFAULT 0,
      freshness_score REAL NOT NULL DEFAULT 0,
      evidence_confidence REAL NOT NULL DEFAULT 0,
      contactability_score REAL NOT NULL DEFAULT 0,
      recommended_offer TEXT,
      recommended_angle TEXT,
      recommended_next_action TEXT,
      actionable_lead_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(strategy_id, signal_event_id, company_id)
    );

    CREATE TABLE IF NOT EXISTS provider_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      crawl_run_id INTEGER REFERENCES crawl_runs(id),
      provider_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      ok INTEGER NOT NULL,
      calls INTEGER NOT NULL DEFAULT 1,
      tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      latency_ms INTEGER,
      error_class TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_signal_events_strategy_status ON signal_events(strategy_id, status);
    CREATE INDEX IF NOT EXISTS idx_signal_events_company ON signal_events(canonical_company_id);
    CREATE INDEX IF NOT EXISTS idx_opportunities_priority ON lead_opportunities(priority_score DESC);
    CREATE INDEX IF NOT EXISTS idx_people_company ON people(company_id);
    CREATE INDEX IF NOT EXISTS idx_usage_run_provider ON provider_usage(crawl_run_id, provider_id);
  `);
}
