/**
 * Seed the demo world:
 *   - 30 owners total → 15 ACTIVE (live now) + 15 RESERVED (flip on later).
 *   - A realistic spread of connected accounts across the platform registry
 *     for the active owners (so the pool has real depth to rotate through).
 *   - A batch of raw leads ready to be enriched by the engine.
 *
 * Idempotent-ish: wipes and rebuilds so `npm run seed` always gives a clean demo.
 */

import { db, migrate } from './index.js';
import { PLATFORMS } from '../core/registry.js';
import { seal } from '../core/vault.js';

const ACTIVE = 15;
const TOTAL = 30;

const NAMES = [
  'Maya Alchemist', 'Diego Santos', 'Priya Nair', 'Sam Okonkwo', 'Lena Petrov',
  'Omar Haddad', 'Grace Kim', 'Tobias Lund', 'Aisha Rahman', 'Noah Brooks',
  'Yuki Tanaka', 'Sofia Rossi', 'Marcus Webb', 'Ivy Chen', 'Rafael Costa',
  'Hana Suzuki', 'Leo Martins', 'Zara Malik', 'Ethan Cole', 'Nadia Farah',
  'Bruno Alves', 'Chloe Dubois', 'Arjun Mehta', 'Elena Vasquez', 'Kofi Mensah',
  'Lucia Romano', 'Dmitri Volkov', 'Fatima Zahra', 'Owen Wright', 'Isla Murphy',
];

const COMPANIES = [
  'Northwind Logistics', 'BrightLedger', 'Cobalt Health', 'Peakflow SaaS', 'Verdant Retail',
  'Ironclad Legal', 'Lumen Fintech', 'Harborview Clinics', 'Datapine Analytics', 'Fernweh Travel',
  'Solaris Energy', 'Maple & Co Agency', 'Quantum Freight', 'Beacon Dental', 'Trellis HR',
  'Copperline Mfg', 'Nimbus DevTools', 'Willow Wellness', 'Granite Contractors', 'Aurora Cosmetics',
  'Pixel Forge Studio', 'Cedar Financial', 'Vantage E-com', 'Onyx Security', 'Larkspur Media',
  'Basalt Construction', 'Kettle & Grain', 'Meridian Consulting', 'Frostbyte Cloud', 'Sable Interiors',
];

function reset() {
  migrate();
  for (const t of ['lead_signals', 'enrichment_runs', 'leads', 'accounts', 'owners', 'audit_log']) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
}

function seedOwners() {
  const ins = db.prepare(
    `INSERT INTO owners (name, email, role, status, share_pct, invite_state)
     VALUES (?,?,?,?,?,?)`,
  );
  NAMES.forEach((name, i) => {
    const active = i < ACTIVE;
    const role = i === 0 ? 'admin' : 'operator';
    ins.run(
      name,
      name.toLowerCase().replace(/[^a-z]+/g, '.') + '@alchemist.team',
      role,
      active ? 'active' : 'reserved',
      +(100 / TOTAL).toFixed(2),
      active && i < 9 ? 'connected' : 'pending',
    );
  });
}

function seedAccounts() {
  const owners = db.prepare(`SELECT id, status FROM owners`).all() as { id: number; status: string }[];
  const ins = db.prepare(
    `INSERT INTO accounts (owner_id, platform_id, label, auth_type, secret_sealed, status,
         quota_limit, quota_used, health, last_used_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const o of owners) {
    for (const p of PLATFORMS) {
      // Public/gateway platforms are always available; others: active owners
      // connect ~75% of their accounts, reserved owners stay disconnected.
      const isPublic = p.authType === 'public' || p.authType === 'mcp_gateway';
      let status: 'connected' | 'disconnected' | 'error' = 'disconnected';
      if (o.status === 'active') {
        const r = Math.random();
        status = isPublic || r > 0.25 ? 'connected' : r > 0.15 ? 'error' : 'disconnected';
      } else if (isPublic) {
        status = 'disconnected'; // reserved: wired in architecture, held offline
      }
      const used = status === 'connected' ? Math.floor(Math.random() * (p.defaultQuota ?? 5000) * 0.6) : 0;
      ins.run(
        o.id, p.id, `${p.name}`, p.authType,
        status === 'connected' ? seal({ apiKey: `demo_${p.id}_${o.id}` }) : null,
        status, p.defaultQuota ?? 5000, used,
        60 + Math.floor(Math.random() * 40),
        status === 'connected' ? new Date(Date.now() - Math.random() * 6e8).toISOString() : null,
      );
    }
  }
}

function seedLeads() {
  const ins = db.prepare(
    `INSERT INTO leads (company, domain, product, status, source) VALUES (?,?,?,?,?)`,
  );
  COMPANIES.forEach((c) => {
    ins.run(
      c,
      c.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com',
      'BOTH', 'new', 'seed',
    );
  });
}

reset();
seedOwners();
seedAccounts();
seedLeads();

const counts = {
  owners: (db.prepare(`SELECT COUNT(*) n FROM owners`).get() as any).n,
  active: (db.prepare(`SELECT COUNT(*) n FROM owners WHERE status='active'`).get() as any).n,
  accounts: (db.prepare(`SELECT COUNT(*) n FROM accounts`).get() as any).n,
  connected: (db.prepare(`SELECT COUNT(*) n FROM accounts WHERE status='connected'`).get() as any).n,
  leads: (db.prepare(`SELECT COUNT(*) n FROM leads`).get() as any).n,
};
console.log('✅ Seed complete:', counts);
