import type { ScrapeTask, ScrapeResult } from '../engine.js';

export function ycScrapeTask(company: string): ScrapeTask {
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    platformId: 'ycombinator',
    url: `https://www.ycombinator.com/companies?q=${encodeURIComponent(company)}`,
    extract: async (page): Promise<ScrapeResult> => {
      const evidence: string[] = [];

      const cards = await page.$$('a[class*="company"]');
      for (const card of cards.slice(0, 3)) {
        const name = await card.$eval('[class*="name"], h2, h3', (el) => el.textContent?.trim() ?? '').catch(() => '');
        const desc = await card.$eval('[class*="description"], p', (el) => el.textContent?.trim() ?? '').catch(() => '');
        const batch = await card.$eval('[class*="batch"]', (el) => el.textContent?.trim() ?? '').catch(() => '');
        const hiring = await card.$('[class*="hiring"]').catch(() => null);

        if (name.toLowerCase().includes(slug.split('-')[0])) {
          if (batch) evidence.push(`YC batch: ${batch} — ${name}`);
          if (hiring) evidence.push(`isHiring flag set in YC directory for ${name}`);
          if (desc) evidence.push(`YC company: ${desc.slice(0, 120)}`);
        }
      }

      if (evidence.length === 0) {
        const text = await page.textContent('body').catch(() => '');
        if (text?.toLowerCase().includes(company.toLowerCase())) {
          evidence.push(`Found in YC directory: ${company}`);
        }
      }

      return { evidence };
    },
  };
}
