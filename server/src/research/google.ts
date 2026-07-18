import type { ScrapeTask } from '../scrapers/engine.js';
import { runScrape } from '../scrapers/engine.js';

export interface GoogleResearchQuery {
  query: string;
  country?: string;
  maxResults?: number;
  freshness?: 'day' | 'week' | 'month';
}

export interface GoogleResearchResult {
  title: string;
  url: string;
  snippet: string;
  displayedDomain?: string;
}

function buildUrl(input: GoogleResearchQuery) {
  const params = new URLSearchParams({ q: input.query, num: String(Math.min(input.maxResults ?? 10, 20)) });
  if (input.country) params.set('gl', input.country.toLowerCase());
  if (input.freshness) {
    const map = { day: 'd', week: 'w', month: 'm' } as const;
    params.set('tbs', `qdr:${map[input.freshness]}`);
  }
  return `https://www.google.com/search?${params.toString()}`;
}

/**
 * Keyless Google research through the existing browser engine.
 * This intentionally uses conservative limits and must respect Google terms,
 * robots directives, local law, and the configured crawl budget.
 */
export async function googleResearch(input: GoogleResearchQuery): Promise<GoogleResearchResult[]> {
  const task: ScrapeTask = {
    platformId: 'google-search',
    url: buildUrl(input),
    extract: async (page) => {
      const rows = await page.locator('div.MjjYud, div.g').evaluateAll((nodes) =>
        nodes.slice(0, 20).map((node) => {
          const titleEl = node.querySelector('h3');
          const linkEl = titleEl?.closest('a') || node.querySelector('a');
          const snippetEl = node.querySelector('[data-sncf], .VwiC3b, .aCOpRe');
          const citeEl = node.querySelector('cite');
          return {
            title: titleEl?.textContent?.trim() || '',
            url: linkEl?.getAttribute('href') || '',
            snippet: snippetEl?.textContent?.trim() || '',
            displayedDomain: citeEl?.textContent?.trim() || undefined,
          };
        }).filter((x) => x.title && x.url)
      );
      return { evidence: rows.map((x) => `${x.title} — ${x.snippet}`), structured: { rows } };
    },
  };

  const out = await runScrape(task);
  const rows = (out.structured?.rows ?? []) as GoogleResearchResult[];
  return rows.slice(0, input.maxResults ?? 10);
}

export function buildSignalQueries(params: {
  product: string;
  pains: string[];
  signals: string[];
  industries: string[];
  country: string;
}) {
  const industry = params.industries.map((x) => `\"${x}\"`).join(' OR ');
  const signal = params.signals.map((x) => `\"${x}\"`).join(' OR ');
  const pain = params.pains.map((x) => `\"${x}\"`).join(' OR ');
  return [
    `(${industry}) (${signal}) ${params.country}`,
    `(${industry}) (${pain}) ${params.country} company`,
    `site:linkedin.com/company (${signal}) (${industry}) ${params.country}`,
    `(${signal}) SME OR small business OR mid-sized ${params.country}`,
  ];
}
