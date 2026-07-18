/**
 * Platform scraper registry — maps each non-API platform to its Crawlee-based
 * scrape task factory. When LIVE_MODE=true, the ScraperConnector calls the
 * appropriate factory here instead of the DemoConnector's synthetic data.
 */

import type { ScrapeTask } from '../engine.js';
import { ycScrapeTask } from './ycombinator.js';
import { linkedinCompanyScrapeTask, linkedinJobsScrapeTask } from './linkedin.js';
import { wellfoundScrapeTask } from './wellfound.js';
import { glassdoorScrapeTask } from './glassdoor.js';
import { capterraScrapeTask } from './capterra.js';
import { trustradiusScrapeTask } from './trustradius.js';
import { clutchScrapeTask } from './clutch.js';
import { thomasnetScrapeTask } from './thomasnet.js';
import { mantaScrapeTask } from './manta.js';
import { googleBusinessScrapeTask } from './google_business.js';

export interface ScraperFactoryInput {
  company: string;
  domain?: string;
  location?: string;
  cookies?: { name: string; value: string; domain: string }[];
}

export type ScraperFactory = (input: ScraperFactoryInput) => ScrapeTask[];

const factories: Record<string, ScraperFactory> = {
  ycombinator: ({ company }) => [ycScrapeTask(company)],

  linkedin: ({ company, cookies }) => [
    linkedinCompanyScrapeTask(company, cookies),
    linkedinJobsScrapeTask(company, cookies),
  ],

  wellfound: ({ company, cookies }) => [wellfoundScrapeTask(company, cookies)],

  glassdoor: ({ company, cookies }) => [glassdoorScrapeTask(company, cookies)],

  capterra: ({ company, cookies }) => [capterraScrapeTask(company, cookies)],

  trustradius: ({ company, cookies }) => [trustradiusScrapeTask(company, cookies)],

  clutch: ({ company, cookies }) => [clutchScrapeTask(company, cookies)],

  thomasnet: ({ company, cookies }) => [thomasnetScrapeTask(company, cookies)],

  manta: ({ company, cookies }) => [mantaScrapeTask(company, cookies)],

  google_business: ({ company, location }) => [googleBusinessScrapeTask(company, location)],
};

export function getScraperFactory(platformId: string): ScraperFactory | undefined {
  return factories[platformId];
}

export function hasScraperSupport(platformId: string): boolean {
  return platformId in factories;
}

export const SCRAPER_PLATFORMS = Object.keys(factories);
