/**
 * Signal Events service — manages the lifecycle of signal-first records.
 *
 * Workflow: new → reviewed → selected → enrichment_in_progress → enriched
 *                         ↘ rejected
 */

import type Database from 'better-sqlite3';

export type SignalStatus = 'new' | 'reviewed' | 'selected' | 'enrichment_in_progress' | 'enriched' | 'rejected';

export interface CreateSignalEvent {
  signal_code: string;
  title: string;
  company_name?: string;
  company_domain?: string;
  source_url: string;
  source_platform: string;
  evidence: string;
  strength?: number;
  room_origin: 1 | 3;
  strategy_id?: number;
}

export interface SignalEvent {
  id: number;
  signal_code: string;
  title: string;
  company_name: string | null;
  company_domain: string | null;
  source_url: string;
  source_platform: string;
  evidence: string;
  strength: number;
  status: SignalStatus;
  room_origin: number;
  strategy_id: number | null;
  enrichment_data: string | null;
  reviewed_at: string | null;
  selected_at: string | null;
  rejected_at: string | null;
  enriched_at: string | null;
  created_at: string;
}

export class SignalEventsService {
  constructor(private db: Database.Database) {}

  create(evt: CreateSignalEvent): number {
    if (!evt.source_url || !evt.source_platform || !evt.evidence) {
      throw new Error('source_url, source_platform, and evidence are mandatory');
    }
    const info = this.db.prepare(
      `INSERT INTO signal_events (signal_code, title, company_name, company_domain, source_url, source_platform, evidence, strength, room_origin, strategy_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      evt.signal_code,
      evt.title,
      evt.company_name ?? null,
      evt.company_domain ?? null,
      evt.source_url,
      evt.source_platform,
      evt.evidence,
      evt.strength ?? 0,
      evt.room_origin,
      evt.strategy_id ?? null,
    );
    return Number(info.lastInsertRowid);
  }

  createBatch(events: CreateSignalEvent[]): number[] {
    const ids: number[] = [];
    const txn = this.db.transaction(() => {
      for (const evt of events) {
        ids.push(this.create(evt));
      }
    });
    txn();
    return ids;
  }

  getById(id: number): SignalEvent | null {
    return (this.db.prepare('SELECT * FROM signal_events WHERE id=?').get(id) as SignalEvent) ?? null;
  }

  inbox(status: SignalStatus | SignalStatus[] = 'new', limit = 100): SignalEvent[] {
    const statuses = Array.isArray(status) ? status : [status];
    const placeholders = statuses.map(() => '?').join(',');
    return this.db.prepare(
      `SELECT * FROM signal_events WHERE status IN (${placeholders}) ORDER BY strength DESC, created_at DESC LIMIT ?`
    ).all(...statuses, limit) as SignalEvent[];
  }

  byRoom(room: 1 | 3, limit = 100): SignalEvent[] {
    return this.db.prepare(
      `SELECT * FROM signal_events WHERE room_origin=? ORDER BY created_at DESC LIMIT ?`
    ).all(room, limit) as SignalEvent[];
  }

  review(id: number): void {
    this.db.prepare(
      `UPDATE signal_events SET status='reviewed', reviewed_at=datetime('now') WHERE id=? AND status='new'`
    ).run(id);
  }

  reject(id: number): void {
    this.db.prepare(
      `UPDATE signal_events SET status='rejected', rejected_at=datetime('now') WHERE id=? AND status IN ('new','reviewed')`
    ).run(id);
  }

  select(id: number): void {
    this.db.prepare(
      `UPDATE signal_events SET status='selected', selected_at=datetime('now') WHERE id=? AND status IN ('new','reviewed')`
    ).run(id);
  }

  selectBatch(ids: number[]): number {
    let count = 0;
    const txn = this.db.transaction(() => {
      for (const id of ids) {
        const r = this.db.prepare(
          `UPDATE signal_events SET status='selected', selected_at=datetime('now') WHERE id=? AND status IN ('new','reviewed')`
        ).run(id);
        count += r.changes;
      }
    });
    txn();
    return count;
  }

  startEnrichment(id: number): void {
    this.db.prepare(
      `UPDATE signal_events SET status='enrichment_in_progress' WHERE id=? AND status='selected'`
    ).run(id);
  }

  completeEnrichment(id: number, data: Record<string, unknown>): void {
    this.db.prepare(
      `UPDATE signal_events SET status='enriched', enrichment_data=?, enriched_at=datetime('now') WHERE id=?`
    ).run(JSON.stringify(data), id);
  }

  stats(): { total: number; new: number; reviewed: number; selected: number; enriched: number; rejected: number } {
    const rows = this.db.prepare(
      `SELECT status, COUNT(*) as n FROM signal_events GROUP BY status`
    ).all() as { status: string; n: number }[];
    const m: Record<string, number> = {};
    for (const r of rows) m[r.status] = r.n;
    return {
      total: Object.values(m).reduce((a, b) => a + b, 0),
      new: m.new ?? 0,
      reviewed: m.reviewed ?? 0,
      selected: m.selected ?? 0,
      enriched: m.enriched ?? 0,
      rejected: m.rejected ?? 0,
    };
  }
}
