import type { ScrapeTask, ScrapeResult } from '../engine.js';

export function linkedinCompanyScrapeTask(
  company: string,
  cookies?: { name: string; value: string; domain: string }[],
): ScrapeTask {
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    platformId: 'linkedin',
    url: `https://www.linkedin.com/company/${slug}/`,
    cookies: cookies ?? [],
    extract: async (page): Promise<ScrapeResult> => {
      const evidence: string[] = [];

      const blocked = await page.$('div[class*="auth-wall"], #join-form').catch(() => null);
      if (blocked) return { evidence: [], rateLimited: true };

      const about = await page.$eval(
        'section[class*="about"] p, [data-test-id="about-us__description"]',
        (el) => el.textContent?.trim() ?? '',
      ).catch(() => '');
      if (about) evidence.push(`LinkedIn about: ${about.slice(0, 150)}`);

      const size = await page.$eval(
        '[data-test-id="about-us__size"], dt:has-text("Company size") + dd',
        (el) => el.textContent?.trim() ?? '',
      ).catch(() => '');
      if (size) evidence.push(`Company size on LinkedIn: ${size}`);

      const jobs = await page.$$eval(
        'a[href*="/jobs/"], [class*="job-card"]',
        (els) => els.slice(0, 5).map((el) => el.textContent?.trim() ?? ''),
      ).catch(() => []);
      for (const j of jobs) {
        if (j) evidence.push(`Now hiring: ${j.slice(0, 100)}`);
      }

      const posts = await page.$$eval(
        '[class*="feed-shared-text"], [class*="update-components-text"]',
        (els) => els.slice(0, 3).map((el) => el.textContent?.trim().slice(0, 120) ?? ''),
      ).catch(() => []);
      for (const p of posts) {
        if (p) evidence.push(`LinkedIn post: ${p}`);
      }

      return { evidence };
    },
  };
}

export function linkedinJobsScrapeTask(
  company: string,
  cookies?: { name: string; value: string; domain: string }[],
): ScrapeTask {
  return {
    platformId: 'linkedin',
    url: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(company)}&f_C=`,
    cookies: cookies ?? [],
    extract: async (page): Promise<ScrapeResult> => {
      const evidence: string[] = [];

      const titles = await page.$$eval(
        '.job-card-container__link, a[class*="job-card-list__title"]',
        (els) => els.slice(0, 8).map((el) => el.textContent?.trim() ?? ''),
      ).catch(() => []);

      for (const t of titles) {
        if (t) evidence.push(`Now hiring: ${t} — posted recently`);
      }

      return { evidence };
    },
  };
}
