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
import { migrateRooms } from './schema-rooms.js';
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
  migrateRooms();
  for (const t of ['signal_events', 'strategies', 'system_state', 'lead_signals', 'enrichment_runs', 'leads', 'accounts', 'owners', 'audit_log']) {
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

function seedStrategies() {
  db.prepare(
    `INSERT INTO strategies (name, product, pains, customer_types, regions, industries, exclusions, employee_min, employee_max, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'SME Automation Buyers',
    'BOTH',
    JSON.stringify(['manual processes', 'scaling pain', 'cash flow issues', 'no visibility']),
    JSON.stringify(['SME', 'startup', 'scaleup']),
    JSON.stringify(['US', 'UK', 'EU', 'ANZ']),
    JSON.stringify(['SaaS', 'Fintech', 'Healthcare', 'E-commerce', 'Professional Services']),
    JSON.stringify(['enterprise', 'government', 'fortune500']),
    5,
    500,
    1,
  );
}

function seedSignalEvents() {
  const sigs = [
    { code: 'A15', title: 'Funding announcement', company: 'Peakflow SaaS', domain: 'peakflowsaas.com', url: 'https://crunchbase.com/peakflow-series-a', platform: 'crunchbase', evidence: 'Peakflow raised $8M Series A led by Acme Ventures', strength: 11 },
    { code: 'A01', title: 'Job postings / hiring surge', company: 'BrightLedger', domain: 'brightledger.com', url: 'https://linkedin.com/jobs/brightledger-hiring', platform: 'linkedin', evidence: 'BrightLedger posted 5 new roles in engineering and ops this week', strength: 8 },
    { code: 'A20', title: 'Still using spreadsheets for AR', company: 'Granite Contractors', domain: 'granitecontractors.com', url: 'https://glassdoor.com/granite-review-123', platform: 'glassdoor', evidence: 'Employee review mentions "everything is tracked in Excel spreadsheets"', strength: 13 },
    { code: 'A07', title: '"SEO Specialist" job posting', company: 'Aurora Cosmetics', domain: 'auroracosmetics.com', url: 'https://linkedin.com/jobs/aurora-seo-spec', platform: 'linkedin', evidence: 'Aurora Cosmetics hiring SEO Specialist — first time', strength: 12 },
    { code: 'A21', title: 'Zero structured schema', company: 'Kettle & Grain', domain: 'kettleandgrain.com', url: 'https://builtwith.com/kettleandgrain', platform: 'builtwith', evidence: 'No schema.org markup detected on any page', strength: 12 },
  ];

  for (const s of sigs) {
    db.prepare(
      `INSERT INTO signal_events (signal_code, title, company_name, company_domain, source_url, source_platform, evidence, strength, room_origin, strategy_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`
    ).run(s.code, s.title, s.company, s.domain, s.url, s.platform, s.evidence, s.strength);
  }
}

reset();
seedOwners();
seedAccounts();
seedLeads();
seedStrategies();
seedSignalEvents();

const counts = {
  owners: (db.prepare(`SELECT COUNT(*) n FROM owners`).get() as any).n,
  active: (db.prepare(`SELECT COUNT(*) n FROM owners WHERE status='active'`).get() as any).n,
  accounts: (db.prepare(`SELECT COUNT(*) n FROM accounts`).get() as any).n,
  connected: (db.prepare(`SELECT COUNT(*) n FROM accounts WHERE status='connected'`).get() as any).n,
  leads: (db.prepare(`SELECT COUNT(*) n FROM leads`).get() as any).n,
};
console.log('✅ Seed complete:', counts);
