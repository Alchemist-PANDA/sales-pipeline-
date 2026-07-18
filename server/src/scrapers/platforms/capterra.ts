import type { ScrapeTask, ScrapeResult } from '../engine.js';

export function capterraScrapeTask(
  company: string,
  cookies?: { name: string; value: string; domain: string }[],
): ScrapeTask {
  return {
    platformId: 'capterra',
    url: `https://www.capterra.com/search/?query=${encodeURIComponent(company)}`,
    cookies: cookies ?? [],
    extract: async (page): Promise<ScrapeResult> => {
      const evidence: string[] = [];

      const cards = await page.$$eval(
        '[class*="product-card"], [data-testid="product-card"]',
        (els) =>
          els.slice(0, 3).map((el) => ({
            name: el.querySelector('h2, [class*="name"]')?.textContent?.trim() ?? '',
            desc: el.querySelector('p, [class*="description"]')?.textContent?.trim() ?? '',
            rating: el.querySelector('[class*="rating"]')?.textContent?.trim() ?? '',
          })),
      ).catch(() => []);

      for (const c of cards) {
        if (c.name) evidence.push(`Capterra listing: ${c.name} — ${c.desc?.slice(0, 100)}`);
        if (c.rating) evidence.push(`Capterra rating for ${c.name}: ${c.rating}`);
      }

      const categories = await page.$$eval(
        '[class*="category"], [data-testid="category-tag"]',
        (els) => els.slice(0, 5).map((el) => el.textContent?.trim() ?? ''),
      ).catch(() => []);
      if (categories.length) evidence.push(`Tech categories: ${categories.join(', ')}`);

      return { evidence };
    },
  };
}
