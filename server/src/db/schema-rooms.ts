/**
 * Signal-first three-room schema extension.
 * Adds: system_state, strategies, signal_events, companies.
 */

import { db } from './index.js';

export function migrateRooms() {
  db.exec(ROOMS_SCHEMA);
}

export const ROOMS_SCHEMA = `
-- Key-value state for the room system (active_room, timestamps, etc.)
CREATE TABLE IF NOT EXISTS system_state (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL,
  set_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Strategy context: product, pains, customer types, geography, industries, exclusions.
-- The operator defines a strategy BEFORE crawling begins.
CREATE TABLE IF NOT EXISTS strategies (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  product      TEXT NOT NULL DEFAULT 'BOTH',      -- GEO | AR | BOTH
  pains        TEXT,                               -- JSON array
  customer_types TEXT,                             -- JSON array (e.g. SME, startup)
  regions      TEXT,                               -- JSON array
  industries   TEXT,                               -- JSON array
  exclusions   TEXT,                               -- JSON array (domains, patterns)
  employee_min INTEGER DEFAULT 5,
  employee_max INTEGER DEFAULT 500,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Signal-first events: every detected buying signal as a first-class record.
-- Workflow: new → reviewed → selected → enrichment_in_progress → enriched → rejected
CREATE TABLE IF NOT EXISTS signal_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_code   TEXT NOT NULL,
  title         TEXT NOT NULL,
  company_name  TEXT,
  company_domain TEXT,
  source_url    TEXT NOT NULL,
  source_platform TEXT NOT NULL,
  evidence      TEXT NOT NULL,
  strength      INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'new',       -- new|reviewed|selected|enrichment_in_progress|enriched|rejected
  room_origin   INTEGER NOT NULL DEFAULT 1,       -- 1=signal room, 3=manual
  strategy_id   INTEGER REFERENCES strategies(id),
  enrichment_data TEXT,                            -- JSON: enriched company/contact info
  reviewed_at   TEXT,
  selected_at   TEXT,
  rejected_at   TEXT,
  enriched_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signal_events_status ON signal_events(status);
CREATE INDEX IF NOT EXISTS idx_signal_events_code ON signal_events(signal_code);
CREATE INDEX IF NOT EXISTS idx_signal_events_company ON signal_events(company_domain);
`;
