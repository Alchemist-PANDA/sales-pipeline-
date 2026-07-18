/**
 * Strategy service — manages operator-defined strategies that drive signal crawling.
 * No random crawling: every Room 1 run must reference a strategy.
 */

import type Database from 'better-sqlite3';

export interface Strategy {
  id: number;
  name: string;
  product: string;
  pains: string[];
  customer_types: string[];
  regions: string[];
  industries: string[];
  exclusions: string[];
  employee_min: number;
  employee_max: number;
  active: boolean;
  created_at: string;
}

export interface CreateStrategy {
  name: string;
  product?: string;
  pains?: string[];
  customer_types?: string[];
  regions?: string[];
  industries?: string[];
  exclusions?: string[];
  employee_min?: number;
  employee_max?: number;
}

export class StrategyService {
  constructor(private db: Database.Database) {}

  create(s: CreateStrategy): number {
    const info = this.db.prepare(
      `INSERT INTO strategies (name, product, pains, customer_types, regions, industries, exclusions, employee_min, employee_max)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      s.name,
      s.product ?? 'BOTH',
      JSON.stringify(s.pains ?? []),
      JSON.stringify(s.customer_types ?? ['SME']),
      JSON.stringify(s.regions ?? []),
      JSON.stringify(s.industries ?? []),
      JSON.stringify(s.exclusions ?? []),
      s.employee_min ?? 5,
      s.employee_max ?? 500,
    );
    return Number(info.lastInsertRowid);
  }

  getActive(): Strategy | null {
    const row = this.db.prepare('SELECT * FROM strategies WHERE active=1 ORDER BY id DESC LIMIT 1').get() as any;
    if (!row) return null;
    return this.hydrate(row);
  }

  list(): Strategy[] {
    const rows = this.db.prepare('SELECT * FROM strategies ORDER BY active DESC, id DESC').all() as any[];
    return rows.map(this.hydrate);
  }

  activate(id: number): void {
    this.db.prepare('UPDATE strategies SET active=0').run();
    this.db.prepare('UPDATE strategies SET active=1 WHERE id=?').run(id);
  }

  deactivate(id: number): void {
    this.db.prepare('UPDATE strategies SET active=0 WHERE id=?').run(id);
  }

  private hydrate(row: any): Strategy {
    return {
      ...row,
      pains: JSON.parse(row.pains || '[]'),
      customer_types: JSON.parse(row.customer_types || '[]'),
      regions: JSON.parse(row.regions || '[]'),
      industries: JSON.parse(row.industries || '[]'),
      exclusions: JSON.parse(row.exclusions || '[]'),
      active: !!row.active,
    };
  }
}
