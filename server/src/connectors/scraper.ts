/**
 * ScraperConnector — live connector for non-API platforms.
 *
 * Uses the Crawlee-powered scraping engine to extract real data from platforms
 * that don't have public APIs. Integrates with the account pool to rotate
 * session cookies across the 30-owner pool, spreading load and reducing bans.
 *
 * Replaces Apify (paid) with self-hosted Crawlee (free, TypeScript, stealth).
 */

import { Connector, EnrichInput, EnrichOutput } from './base.js';
import type { AccountRow } from '../core/pool.js';
import { runScrape } from '../scrapers/engine.js';
import { getScraperFactory } from '../scrapers/platforms/index.js';
import { open as vaultOpen } from '../core/vault.js';
import { db } from '../db/index.js';

export class ScraperConnector implements Connector {
  constructor(public platformId: string) {}

  async enrich(input: EnrichInput, account: AccountRow | null): Promise<EnrichOutput> {
    const factory = getScraperFactory(this.platformId);
    if (!factory) {
      return { evidence: [] };
    }

    let cookies: { name: string; value: string; domain: string }[] | undefined;
    if (account) {
      try {
        const row = db
          .prepare(`SELECT secret_sealed FROM accounts WHERE id = ?`)
          .get(account.id) as { secret_sealed: string | null } | undefined;
        if (row?.secret_sealed) {
          const creds = vaultOpen(row.secret_sealed);
          const cookieValue = (creds.sessionCookie || creds.liAt) as string | undefined;
          if (cookieValue) {
            const domainMap: Record<string, string> = {
              linkedin: '.linkedin.com',
              glassdoor: '.glassdoor.com',
              wellfound: '.wellfound.com',
              capterra: '.capterra.com',
              trustradius: '.trustradius.com',
              clutch: '.clutch.co',
              thomasnet: '.thomasnet.com',
              manta: '.manta.com',
            };
            cookies = [
              {
                name: this.platformId === 'linkedin' ? 'li_at' : 'session_id',
                value: cookieValue,
                domain: domainMap[this.platformId] || `.${this.platformId}.com`,
              },
            ];
          }
        }
      } catch {
        // No valid credentials — scrape without auth (public mode)
      }
    }

    const tasks = factory({
      company: input.company,
      domain: input.domain,
      location: undefined,
      cookies,
    });

    const allEvidence: string[] = [];
    let wasRateLimited = false;

    for (const task of tasks) {
      const result = await runScrape(task);
      if (result.rateLimited) wasRateLimited = true;
      allEvidence.push(...result.evidence);
    }

    return {
      evidence: allEvidence,
      rateLimited: wasRateLimited && allEvidence.length === 0 ? true : undefined,
    };
  }
}
