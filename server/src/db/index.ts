/**
 * SQLite database — zero-config persistence so the whole system runs with a
 * single `npm run dev`, no external services. Swappable for Postgres in prod
 * (all access goes through this module).
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateSignalFirst } from './signalFirstSchema.js';
import { migrateCrawl } from '../crawl/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../.data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'alchemist.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS owners (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'operator',
  status       TEXT NOT NULL DEFAULT 'active',
  share_pct    REAL NOT NULL DEFAULT 0,
  invite_token TEXT,
  invite_state TEXT NOT NULL DEFAULT 'pending',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id       INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  platform_id    TEXT NOT NULL,
  label          TEXT NOT NULL,
  auth_type      TEXT NOT NULL,
  secret_sealed  TEXT,
  status         TEXT NOT NULL DEFAULT 'disconnected',
  quota_limit    INTEGER NOT NULL DEFAULT 5000,
  quota_used     INTEGER NOT NULL DEFAULT 0,
  quota_reset_at TEXT NOT NULL DEFAULT (datetime('now','+30 days')),
  cooldown_until TEXT,
  health         INTEGER NOT NULL DEFAULT 100,
  last_used_at   TEXT,
  last_tested_at TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner_id, platform_id)
);

CREATE TABLE IF NOT EXISTS leads (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  company        TEXT NOT NULL,
  domain         TEXT,
  contact_name   TEXT,
  title          TEXT,
  email          TEXT,
  email_status   TEXT,
  phone          TEXT,
  linkedin       TEXT,
  industry       TEXT,
  employee_count INTEGER,
  location       TEXT,
  product        TEXT NOT NULL DEFAULT 'BOTH',
  fit_score      INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'new',
  source         TEXT,
  enrichment     TEXT,
  assigned_owner INTEGER REFERENCES owners(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lead_signals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  signal_code TEXT NOT NULL,
  strength    INTEGER NOT NULL DEFAULT 0,
  evidence    TEXT,
  source      TEXT,
  detected_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS enrichment_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id      INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  platform_id  TEXT NOT NULL,
  account_id   INTEGER,
  owner_name   TEXT,
  ok           INTEGER NOT NULL DEFAULT 1,
  detail       TEXT,
  credits_used INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor      TEXT,
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(fit_score DESC);
CREATE INDEX IF NOT EXISTS idx_signals_lead ON lead_signals(lead_id);
CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform_id);
`;

export function migrate() {
  db.exec(SCHEMA);
  migrateSignalFirst(db);
  migrateCrawl(db);
}
