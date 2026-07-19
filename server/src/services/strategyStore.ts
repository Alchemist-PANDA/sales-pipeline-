/**
 * Strategy store — CRUD over the `strategies` table.
 *
 * A strategy is the mandatory context every collector run and enrichment pass
 * depends on: product, pains, target signals, ICP (industries, geography, SME
 * size band), personas, and keyword filters. Previously a strategy could only
 * exist via a raw DB insert; this service (and its routes) make strategies a
 * first-class, user-manageable object.
 *
 * The persisted `strategy_json` is intentionally stored in a shape that is
 * compatible with BOTH the collector layer (sourceCollectors.loadStrategy, which
 * reads `product.painsSolved`, `signalFilters.include`, `icp.industries`,
 * `geography.countries`, …) and the enrichment layer (persona titles + employee
 * band). One object, consumed by every stage.
 */

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

export interface StrategyInput {
  name: string;
  product?: string;
  productDescription?: string;
  pains?: string[];
  useCases?: string[];
  signals?: string[];
  industries?: string[];
  countries?: string[];
  regions?: string[];
  positiveKeywords?: string[];
  negativeKeywords?: string[];
  targetTitles?: string[];
  employeeMin?: number;
  employeeMax?: number;
  minimumConfidence?: number;
  minimumRelevance?: number;
}

export interface StrategyRecord {
  id: string;
  name: string;
  status: string;
  strategy: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((x) => x.trim()).filter(Boolean);
  return [];
}

/** Build the canonical, multi-consumer strategy_json from simple UI input. */
export function buildStrategyJson(input: StrategyInput): Record<string, unknown> {
  const countries = arr(input.countries).length ? arr(input.countries) : ['US'];
  const industries = arr(input.industries);
  const pains = arr(input.pains);
  const signals = arr(input.signals);
  const employeeMin = Number.isFinite(input.employeeMin as number) ? Number(input.employeeMin) : 5;
  const employeeMax = Number.isFinite(input.employeeMax as number) ? Number(input.employeeMax) : 500;

  return {
    product: {
      name: (input.product || 'agentic systems and SaaS').trim(),
      description: (input.productDescription || '').trim(),
      painsSolved: pains,
      useCases: arr(input.useCases),
      excludedUseCases: [],
    },
    pains,
    signals,
    signalFilters: {
      include: signals,
      positiveKeywords: arr(input.positiveKeywords),
      negativeKeywords: arr(input.negativeKeywords),
    },
    positiveKeywords: arr(input.positiveKeywords),
    negativeKeywords: arr(input.negativeKeywords),
    icp: {
      industries,
      employeeRange: { min: employeeMin, max: employeeMax },
    },
    industries,
    geography: { countries, regions: arr(input.regions) },
    country: countries[0],
    regions: arr(input.regions),
    personas: { targetTitles: arr(input.targetTitles).length ? arr(input.targetTitles) : ['Founder', 'CEO', 'Head of Operations', 'CFO'] },
    maxEmployees: employeeMax,
    thresholds: {
      minimumConfidence: input.minimumConfidence ?? 0.55,
      minimumRelevance: input.minimumRelevance ?? 0.35,
    },
  };
}

export class StrategyStore {
  constructor(private db: Database.Database) {}

  create(input: StrategyInput): StrategyRecord {
    if (!input?.name?.trim()) throw new Error('Strategy name is required.');
    if (!arr(input.industries).length) throw new Error('At least one target industry is required.');
    if (!arr(input.pains).length && !arr(input.signals).length && !arr(input.positiveKeywords).length)
      throw new Error('Provide at least one pain, signal, or keyword so discovery has something to target.');

    const id = `strat_${crypto.randomBytes(6).toString('hex')}`;
    const strategy = buildStrategyJson(input);
    // First strategy becomes active automatically; later ones start as draft.
    const anyActive = this.db.prepare(`SELECT 1 FROM strategies WHERE status='active' LIMIT 1`).get();
    const status = anyActive ? 'draft' : 'active';
    this.db.prepare(
      `INSERT INTO strategies (id, name, strategy_json, status) VALUES (?,?,?,?)`,
    ).run(id, input.name.trim(), JSON.stringify(strategy), status);
    return this.get(id)!;
  }

  update(id: string, input: StrategyInput): StrategyRecord {
    const existing = this.get(id);
    if (!existing) throw new Error(`Strategy not found: ${id}`);
    const strategy = buildStrategyJson(input);
    this.db.prepare(
      `UPDATE strategies SET name=?, strategy_json=?, updated_at=datetime('now') WHERE id=?`,
    ).run(input.name?.trim() || existing.name, JSON.stringify(strategy), id);
    return this.get(id)!;
  }

  get(id: string): StrategyRecord | null {
    const row = this.db.prepare(`SELECT * FROM strategies WHERE id=?`).get(id) as any;
    return row ? this.hydrate(row) : null;
  }

  list(): StrategyRecord[] {
    return (this.db.prepare(`SELECT * FROM strategies ORDER BY status='active' DESC, updated_at DESC`).all() as any[])
      .map((r) => this.hydrate(r));
  }

  getActive(): StrategyRecord | null {
    const row = this.db.prepare(`SELECT * FROM strategies WHERE status='active' ORDER BY updated_at DESC LIMIT 1`).get() as any;
    return row ? this.hydrate(row) : null;
  }

  activate(id: string): StrategyRecord {
    const existing = this.get(id);
    if (!existing) throw new Error(`Strategy not found: ${id}`);
    const tx = this.db.transaction(() => {
      this.db.prepare(`UPDATE strategies SET status='draft' WHERE status='active'`).run();
      this.db.prepare(`UPDATE strategies SET status='active', updated_at=datetime('now') WHERE id=?`).run(id);
    });
    tx();
    return this.get(id)!;
  }

  remove(id: string): void {
    this.db.prepare(`DELETE FROM strategies WHERE id=?`).run(id);
  }

  private hydrate(row: any): StrategyRecord {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      strategy: JSON.parse(row.strategy_json || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
