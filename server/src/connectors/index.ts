/**
 * Connector implementations.
 *
 * In DEMO mode each connector synthesizes realistic, deterministic output for
 * its platform "specialty" (contact data, hiring signals, tech-stack, funding,
 * reviews, local, first-party intent). In LIVE mode the same methods would call
 * the real API / MCP gateway using the leased account's decrypted credential.
 *
 * The synthetic evidence strings are deliberately worded to match the keyword
 * rules in core/signals.ts, so the demo produces genuine end-to-end scoring.
 */

import { Connector, DEMO, EnrichInput, EnrichOutput, pick, seededRand } from './base.js';
import type { AccountRow } from '../core/pool.js';
import { PLATFORMS_BY_ID } from '../core/registry.js';

const INDUSTRIES = ['B2B SaaS', 'E-commerce', 'FinTech', 'Healthcare', 'Professional Services', 'Marketing Agency', 'Manufacturing'];
const CITIES = ['Austin, TX', 'San Francisco, CA', 'New York, NY', 'Denver, CO', 'Miami, FL', 'Chicago, IL', 'Remote'];
const FIRST = ['Alex', 'Jordan', 'Priya', 'Sam', 'Taylor', 'Morgan', 'Chris', 'Dana', 'Noor', 'Lee'];
const LAST = ['Rivera', 'Chen', 'Patel', 'Okafor', 'Nguyen', 'Kim', 'Silva', 'Haddad', 'Novak', 'Reyes'];

const HIRING_EVIDENCE = [
  'Now hiring: AR Specialist (Accounts Receivable) — posted 3 days ago',
  'Open role: Collections Analyst — manual invoicing mentioned',
  'Hiring SEO Specialist and Content Marketing Manager (cluster of 3 roles)',
  'Now hiring Growth Marketer — content is getting real investment',
  'Fractional CFO engagement posted',
  'Controller role reposted within 90 days (failed hire)',
];
const FUNDING_EVIDENCE = [
  'Raised Series A funding 6 weeks ago',
  'Seed round announced, isHiring flag set in YC directory',
  'Bridge round / down round reported',
  'Acquired a smaller competitor last quarter',
];
const TECH_EVIDENCE = [
  'Careers page mentions QuickBooks + spreadsheet-based invoicing (manual AR)',
  'Site has zero structured data / no schema markup — GEO gap',
  'Uses Xero for invoicing but no cash-visibility tool detected',
  'ERP migration to NetSuite referenced in a job posting',
];
const REVIEW_EVIDENCE = [
  'Negative G2 review citing billing/invoice issues',
  'Not cited in ChatGPT or Perplexity for its own brand query — no AI citation',
  'Glassdoor reviews mention understaffed finance team',
];
const INTENT_EVIDENCE = [
  'Repeat website visits detected from this account (first-party intent)',
  'RFP posted: "looking for a vendor" in an industry group',
  'SEC filing mentions rising DSO / working-capital strain',
];

function fullName(seed: number): string {
  return `${pick(seed, FIRST)} ${pick(seed * 7.3, LAST)}`;
}

function demoContact(input: EnrichInput, platformId: string): EnrichOutput {
  const s = seededRand(input.company, platformId);
  const domain = input.domain || `${input.company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
  const name = input.contactName || fullName(s);
  const [first, last] = name.toLowerCase().split(' ');
  return {
    email: `${first}.${last}@${domain}`,
    emailStatus: s > 0.25 ? 'verified' : s > 0.1 ? 'risky' : 'unknown',
    phone: s > 0.4 ? `+1 (${200 + Math.floor(s * 700)}) ${100 + Math.floor(s * 800)}-${1000 + Math.floor(s * 8000)}` : undefined,
    linkedin: `linkedin.com/in/${first}-${last}`,
    industry: pick(s, INDUSTRIES),
    employeeCount: 10 + Math.floor(seededRand(input.company, 'size') * 190),
    location: pick(seededRand(input.company, 'loc'), CITIES),
    evidence: [],
  };
}

/** One generic connector, specialized by the platform's declared `provides`. */
class DemoConnector implements Connector {
  constructor(public platformId: string) {}

  async enrich(input: EnrichInput, account: AccountRow | null): Promise<EnrichOutput> {
    const plat = PLATFORMS_BY_ID[this.platformId];
    const s = seededRand(input.company, this.platformId, account?.owner_name ?? '');

    // Simulate an occasional rate-limit so the pool router's failover is real.
    if (DEMO && s > 0.94) return { evidence: [], rateLimited: true };

    const out: EnrichOutput = plat?.enrichment ? demoContact(input, this.platformId) : { evidence: [] };
    const provides = plat?.provides ?? [];
    const ev: string[] = [];

    // Emit sparingly so leads get a realistic *spread* of signals, not all 60.
    const add = (pool: string[], key: string) => {
      if (seededRand(input.company, this.platformId, key) > 0.78)
        ev.push(pick(seededRand(input.company, key), pool));
    };

    if (provides.some((p) => ['hiring', 'leadership', 'attrition'].includes(p))) add(HIRING_EVIDENCE, 'hire');
    if (provides.some((p) => ['funding', 'ma', 'financial_distress'].includes(p))) add(FUNDING_EVIDENCE, 'fund');
    if (provides.includes('tech_stack')) add(TECH_EVIDENCE, 'tech');
    if (provides.some((p) => ['digital_footprint', 'public_content'].includes(p))) add(REVIEW_EVIDENCE, 'rev');
    if (provides.some((p) => ['behavioral', 'event'].includes(p))) add(INTENT_EVIDENCE, 'intent');
    if (provides.includes('local') && s > 0.6)
      ev.push(`Local business listing found; ${s > 0.75 ? 'no website / weak GEO presence' : 'GBP claimed'}`);

    out.evidence = ev;
    return out;
  }
}

const cache = new Map<string, Connector>();
export function getConnector(platformId: string): Connector {
  if (!cache.has(platformId)) cache.set(platformId, new DemoConnector(platformId));
  return cache.get(platformId)!;
}
