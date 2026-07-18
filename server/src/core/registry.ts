/**
 * ============================================================================
 *  CONNECTOR REGISTRY  —  the single source of truth for every integration
 * ============================================================================
 *
 *  Every platform the team uses is declared here ONCE. The registry drives:
 *    - the Integrations UI (which onboarding flow / fields to render)
 *    - the credential vault (what to encrypt & store)
 *    - the account-pool router (rate limits, quota model, cost)
 *    - connection testing (which endpoint to ping)
 *
 *  Design principle the owner asked for:
 *    "make integrations & credential entry extremely simple, easy, fast and
 *     automatic — no manual work."
 *
 *  We achieve that by making onboarding *declarative*. Each platform states
 *  HOW it authenticates (`authType`) and HOW a human connects it
 *  (`onboarding`). The app then picks the lowest-friction path automatically:
 *
 *    mcp_gateway  > oauth2  > api_key  > cookie/session  > public
 *    (zero-touch)   (1 click) (paste 1)   (assisted)        (nothing)
 *
 *  Where a platform exposes an MCP or API gateway that fronts many tools
 *  (e.g. Apify), we adopt the gateway instead of hand-rolling each scraper.
 */

export type AuthType =
  | 'mcp_gateway' // fronted by a Model-Context-Protocol gateway (zero-touch, best)
  | 'api_key' // simple API key / token — paste once, auto-verified
  | 'oauth2' // one-click OAuth connect
  | 'cookie' // session cookie / login-assisted (browser scrapers)
  | 'public'; // public data, no auth required

export type OnboardingMethod =
  | 'gateway_autoconnect' // we hold one gateway token, fans out to all tools
  | 'oauth_click' // "Connect" button → provider consent screen
  | 'paste_key' // paste an API key, we verify it live
  | 'magic_link' // teammate self-connects their own account via invite link
  | 'assisted_cookie' // guided capture of a session (extension / paste)
  | 'none'; // nothing to do

export type SignalCategory =
  | 'hiring'
  | 'leadership'
  | 'funding'
  | 'financial_distress'
  | 'ma'
  | 'tech_stack'
  | 'public_content'
  | 'launch'
  | 'yc'
  | 'digital_footprint'
  | 'attrition'
  | 'event'
  | 'behavioral'
  | 'competitive'
  | 'local'
  | 'contact_data';

export interface CredentialField {
  key: string; // stored key inside the encrypted blob
  label: string; // UI label
  placeholder?: string;
  secret?: boolean; // masked in the UI + never returned by the API
  optional?: boolean;
}

export interface Platform {
  id: string; // stable slug used everywhere
  name: string;
  category: string; // grouping shown in the UI
  authType: AuthType;
  onboarding: OnboardingMethod;
  /** Which of the 60 signals this platform helps capture, or 'contact_data'. */
  provides: SignalCategory[];
  /** True if this platform is part of the waterfall email/contact enrichment. */
  enrichment?: boolean;
  /** Fields the vault needs to store for one account. */
  fields: CredentialField[];
  /** A gateway that fronts this platform (adopted instead of raw integration). */
  gateway?: { kind: 'mcp' | 'api'; name: string; url?: string };
  /** Endpoint we ping to prove the credential works (health/quota check). */
  testHint?: string;
  /** Docs link surfaced in the onboarding wizard. */
  docs?: string;
  /** Default monthly quota assumption per account (used by the pool router). */
  defaultQuota?: number;
  /** Relative $ cost per successful call (for cheapest-first waterfall order). */
  costWeight?: number;
  /** Ordering hint inside a waterfall (lower = tried first). */
  waterfallRank?: number;
  /** Signal generation priority (1 = highest). Drives Room 1 crawl order. */
  signalPriority?: number;
  notes?: string;
}

/** Standard API-key field used by most platforms. */
const KEY = (label = 'API Key'): CredentialField[] => [
  { key: 'apiKey', label, placeholder: 'paste key…', secret: true },
];

export const PLATFORMS: Platform[] = [
  // ── Self-Hosted Scraping Engine (Crawlee — free, stealth, TypeScript) ─────
  {
    id: 'crawlee_engine',
    name: 'Crawlee (Self-Hosted)',
    category: 'Scraping Engine',
    authType: 'public',
    onboarding: 'none',
    provides: ['yc', 'local', 'event', 'launch', 'public_content'],
    fields: [],
    defaultQuota: 999999,
    costWeight: 0,
    signalPriority: 5,
    notes:
      'Self-hosted Crawlee + Playwright with stealth. Replaces paid Apify — ' +
      '$0 cost. Handles YC, LinkedIn, Glassdoor, Capterra, Clutch, ThomasNet, ' +
      'Manta, Wellfound, TrustRadius, Google Business via browser automation.',
  },

  // ── Lead Gen: B2B databases & Chrome extensions ──────────────────────────
  {
    id: 'apollo',
    name: 'Apollo.io',
    category: 'Lead Gen — B2B Database',
    authType: 'api_key',
    onboarding: 'magic_link',
    provides: ['contact_data', 'hiring', 'leadership', 'funding'],
    enrichment: true,
    fields: KEY(),
    testHint: 'POST /v1/auth/health',
    docs: 'https://apolloio.github.io/apollo-api-docs/',
    defaultQuota: 10000,
    costWeight: 3,
    waterfallRank: 3,
    signalPriority: 3,
  },
  {
    id: 'lusha',
    name: 'Lusha',
    category: 'Lead Gen — B2B Database',
    authType: 'api_key',
    onboarding: 'magic_link',
    provides: ['contact_data'],
    enrichment: true,
    fields: KEY(),
    testHint: 'GET /v2/quota',
    defaultQuota: 5000,
    costWeight: 5,
    waterfallRank: 5,
  },
  {
    id: 'contactout',
    name: 'ContactOut',
    category: 'Lead Gen — B2B Database',
    authType: 'api_key',
    onboarding: 'magic_link',
    provides: ['contact_data'],
    enrichment: true,
    fields: [{ key: 'apiKey', label: 'API Token', secret: true }],
    defaultQuota: 4000,
    costWeight: 5,
    waterfallRank: 6,
  },
  {
    id: 'snov',
    name: 'Snov.io',
    category: 'Lead Gen — B2B Database',
    authType: 'api_key',
    onboarding: 'magic_link',
    provides: ['contact_data'],
    enrichment: true,
    fields: [
      { key: 'clientId', label: 'Client ID', secret: false },
      { key: 'clientSecret', label: 'Client Secret', secret: true },
    ],
    testHint: 'POST /v1/oauth/access_token',
    defaultQuota: 5000,
    costWeight: 2,
    waterfallRank: 2,
  },
  {
    id: 'skrapp',
    name: 'Skrapp.io',
    category: 'Lead Gen — B2B Database',
    authType: 'api_key',
    onboarding: 'magic_link',
    provides: ['contact_data'],
    enrichment: true,
    fields: KEY(),
    defaultQuota: 5000,
    costWeight: 2,
    waterfallRank: 4,
  },
  {
    id: 'prospeo',
    name: 'Prospeo.io',
    category: 'Lead Gen — B2B Database',
    authType: 'api_key',
    onboarding: 'magic_link',
    provides: ['contact_data'],
    enrichment: true,
    fields: KEY(),
    testHint: 'POST /account-information',
    defaultQuota: 6000,
    costWeight: 1,
    waterfallRank: 1,
    notes: 'Cheapest, highest-accuracy — first leg of the email waterfall.',
  },
  {
    id: 'getprospect',
    name: 'GetProspect',
    category: 'Lead Gen — B2B Database',
    authType: 'api_key',
    onboarding: 'magic_link',
    provides: ['contact_data'],
    enrichment: true,
    fields: KEY(),
    defaultQuota: 5000,
    costWeight: 2,
    waterfallRank: 7,
  },
  {
    id: 'kaspr',
    name: 'Kaspr',
    category: 'Lead Gen — B2B Database',
    authType: 'api_key',
    onboarding: 'magic_link',
    provides: ['contact_data'],
    enrichment: true,
    fields: KEY(),
    defaultQuota: 4000,
    costWeight: 4,
    waterfallRank: 8,
  },

  // ── Lead Gen: domain searchers & verification ────────────────────────────
  {
    id: 'hunter',
    name: 'Hunter.io',
    category: 'Lead Gen — Domain & Verification',
    authType: 'api_key',
    onboarding: 'magic_link',
    provides: ['contact_data'],
    enrichment: true,
    fields: KEY(),
    testHint: 'GET /v2/account',
    docs: 'https://hunter.io/api-documentation/v2',
    defaultQuota: 5000,
    costWeight: 2,
    waterfallRank: 2,
  },
  {
    id: 'anymailfinder',
    name: 'Anymail Finder',
    category: 'Lead Gen — Domain & Verification',
    authType: 'api_key',
    onboarding: 'magic_link',
    provides: ['contact_data'],
    enrichment: true,
    fields: KEY(),
    defaultQuota: 5000,
    costWeight: 2,
    waterfallRank: 5,
  },
  {
    id: 'findymail',
    name: 'FindyMail',
    category: 'Lead Gen — Domain & Verification',
    authType: 'api_key',
    onboarding: 'magic_link',
    provides: ['contact_data'],
    enrichment: true,
    fields: KEY(),
    defaultQuota: 5000,
    costWeight: 2,
    waterfallRank: 4,
  },
  {
    id: 'findthatlead',
    name: 'FindThatLead',
    category: 'Lead Gen — Domain & Verification',
    authType: 'api_key',
    onboarding: 'magic_link',
    provides: ['contact_data'],
    enrichment: true,
    fields: KEY(),
    defaultQuota: 5000,
    costWeight: 3,
    waterfallRank: 6,
  },

  // ── Startups data ────────────────────────────────────────────────────────
  {
    id: 'producthunt',
    name: 'Product Hunt',
    category: 'Startups Data',
    authType: 'oauth2',
    onboarding: 'oauth_click',
    provides: ['launch', 'tech_stack'],
    fields: [{ key: 'accessToken', label: 'Developer Token', secret: true }],
    docs: 'https://api.producthunt.com/v2/docs',
    defaultQuota: 10000,
    costWeight: 1,
    signalPriority: 14,
  },
  {
    id: 'wellfound',
    name: 'Wellfound',
    category: 'Startups Data',
    authType: 'cookie',
    onboarding: 'assisted_cookie',
    provides: ['hiring', 'funding', 'launch'],
    fields: [{ key: 'sessionCookie', label: 'Session Cookie', secret: true }],
    defaultQuota: 2000,
    costWeight: 2,
    signalPriority: 13,
    notes: 'Scraped via self-hosted Crawlee engine with stealth browser.',
  },
  {
    id: 'openvc',
    name: 'OpenVC.app',
    category: 'Startups Data',
    authType: 'public',
    onboarding: 'none',
    provides: ['funding'],
    fields: [],
    defaultQuota: 20000,
    costWeight: 0,
  },
  {
    id: 'ycombinator',
    name: 'Y Combinator',
    category: 'Startups Data',
    authType: 'public',
    onboarding: 'none',
    provides: ['yc', 'hiring', 'launch'],
    fields: [],
    defaultQuota: 50000,
    costWeight: 0,
    signalPriority: 2,
    notes: 'Public directory scraped via self-hosted Crawlee (batch, isHiring).',
  },
  {
    id: 'g2',
    name: 'G2',
    category: 'Startups Data / Reviews',
    authType: 'api_key',
    onboarding: 'paste_key',
    provides: ['tech_stack', 'digital_footprint', 'behavioral'],
    fields: KEY('Partner API Key'),
    defaultQuota: 3000,
    costWeight: 3,
    signalPriority: 10,
  },
  {
    id: 'capterra',
    name: 'Capterra',
    category: 'Startups Data / Reviews',
    authType: 'cookie',
    onboarding: 'assisted_cookie',
    provides: ['tech_stack', 'digital_footprint'],
    fields: [{ key: 'sessionCookie', label: 'Session Cookie', secret: true }],
    defaultQuota: 2000,
    costWeight: 2,
    notes: 'Scraped via self-hosted Crawlee engine with stealth browser.',
  },
  {
    id: 'trustradius',
    name: 'TrustRadius',
    category: 'Startups Data / Reviews',
    authType: 'cookie',
    onboarding: 'assisted_cookie',
    provides: ['tech_stack', 'digital_footprint'],
    fields: [{ key: 'sessionCookie', label: 'Session Cookie', secret: true }],
    defaultQuota: 2000,
    costWeight: 2,
  },
  {
    id: 'clutch',
    name: 'Clutch.co',
    category: 'Startups Data / Reviews',
    authType: 'cookie',
    onboarding: 'assisted_cookie',
    provides: ['tech_stack', 'local'],
    fields: [{ key: 'sessionCookie', label: 'Session Cookie', secret: true }],
    defaultQuota: 2000,
    costWeight: 2,
    notes: 'Scraped via self-hosted Crawlee engine with stealth browser.',
  },
  {
    id: 'wappalyzer',
    name: 'Wappalyzer',
    category: 'Technology',
    authType: 'api_key',
    onboarding: 'paste_key',
    provides: ['tech_stack'],
    fields: KEY(),
    testHint: 'GET /v2/credits',
    defaultQuota: 5000,
    costWeight: 1,
  },
  {
    id: 'builtwith',
    name: 'BuiltWith',
    category: 'Technology',
    authType: 'api_key',
    onboarding: 'paste_key',
    provides: ['tech_stack'],
    fields: KEY(),
    testHint: 'GET /v21/api.json',
    defaultQuota: 5000,
    costWeight: 1,
    signalPriority: 7,
  },

  // ── Local signals ────────────────────────────────────────────────────────
  {
    id: 'google_business',
    name: 'Google Business Profile',
    category: 'Local Signals',
    authType: 'oauth2',
    onboarding: 'oauth_click',
    provides: ['local', 'digital_footprint'],
    fields: [{ key: 'refreshToken', label: 'OAuth Refresh Token', secret: true }],
    defaultQuota: 20000,
    costWeight: 0,
    signalPriority: 15,
  },
  {
    id: 'yelp',
    name: 'Yelp',
    category: 'Local Signals',
    authType: 'api_key',
    onboarding: 'paste_key',
    provides: ['local'],
    fields: KEY(),
    testHint: 'GET /v3/businesses/search',
    defaultQuota: 5000,
    costWeight: 1,
  },
  {
    id: 'foursquare',
    name: 'Foursquare',
    category: 'Local Signals',
    authType: 'api_key',
    onboarding: 'paste_key',
    provides: ['local'],
    fields: KEY(),
    defaultQuota: 100000,
    costWeight: 0,
  },
  {
    id: 'thomasnet',
    name: 'ThomasNet',
    category: 'Local Signals',
    authType: 'cookie',
    onboarding: 'assisted_cookie',
    provides: ['local'],
    fields: [{ key: 'sessionCookie', label: 'Session Cookie', secret: true }],
    defaultQuota: 2000,
    costWeight: 2,
    notes: 'Scraped via self-hosted Crawlee engine with stealth browser.',
  },
  {
    id: 'manta',
    name: 'Manta',
    category: 'Local Signals',
    authType: 'cookie',
    onboarding: 'assisted_cookie',
    provides: ['local'],
    fields: [{ key: 'sessionCookie', label: 'Session Cookie', secret: true }],
    defaultQuota: 2000,
    costWeight: 2,
    notes: 'Scraped via self-hosted Crawlee engine with stealth browser.',
  },

  // ── Signal enrichment engine + supporting public sources ─────────────────
  {
    id: 'clay',
    name: 'Clay',
    category: 'Enrichment Engine',
    authType: 'api_key',
    onboarding: 'paste_key',
    provides: ['contact_data', 'tech_stack', 'hiring'],
    enrichment: true,
    fields: [{ key: 'webhookUrl', label: 'Table Webhook URL', secret: true }],
    docs: 'https://www.clay.com/university',
    defaultQuota: 25000,
    costWeight: 3,
    signalPriority: 6,
    notes: 'Orchestrates waterfall + Claygent research; we push scored leads out.',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    category: 'Signals — Social',
    authType: 'cookie',
    onboarding: 'assisted_cookie',
    provides: ['hiring', 'leadership', 'attrition', 'public_content'],
    fields: [{ key: 'liAt', label: 'li_at Cookie', secret: true }],
    defaultQuota: 1500,
    costWeight: 4,
    signalPriority: 1,
    notes: 'Hiring + leadership-change signals; rotate across the 30-account pool.',
  },
  {
    id: 'crunchbase',
    name: 'Crunchbase',
    category: 'Signals — Funding & M&A',
    authType: 'api_key',
    onboarding: 'paste_key',
    provides: ['funding', 'ma', 'financial_distress'],
    fields: KEY(),
    defaultQuota: 5000,
    costWeight: 3,
    signalPriority: 4,
  },
  {
    id: 'sec_edgar',
    name: 'SEC EDGAR',
    category: 'Signals — Public Record',
    authType: 'public',
    onboarding: 'none',
    provides: ['event', 'financial_distress', 'ma'],
    fields: [],
    defaultQuota: 100000,
    costWeight: 0,
    signalPriority: 8,
  },
  {
    id: 'uspto',
    name: 'USPTO (Patents/TESS)',
    category: 'Signals — Public Record',
    authType: 'public',
    onboarding: 'none',
    provides: ['event', 'launch'],
    fields: [],
    defaultQuota: 100000,
    costWeight: 0,
    signalPriority: 16,
  },
  {
    id: 'glassdoor',
    name: 'Glassdoor',
    category: 'Signals — People',
    authType: 'cookie',
    onboarding: 'assisted_cookie',
    provides: ['attrition'],
    fields: [{ key: 'sessionCookie', label: 'Session Cookie', secret: true }],
    defaultQuota: 2000,
    costWeight: 2,
    signalPriority: 12,
    notes: 'Scraped via self-hosted Crawlee engine with stealth browser.',
  },
  {
    id: 'similarweb',
    name: 'SimilarWeb',
    category: 'Signals — Digital Footprint',
    authType: 'api_key',
    onboarding: 'paste_key',
    provides: ['digital_footprint'],
    fields: KEY(),
    defaultQuota: 5000,
    costWeight: 3,
    signalPriority: 9,
  },
  {
    id: 'rb2b',
    name: 'RB2B / Warmly',
    category: 'Signals — First-Party Intent',
    authType: 'api_key',
    onboarding: 'paste_key',
    provides: ['behavioral'],
    fields: [{ key: 'apiKey', label: 'Webhook Secret', secret: true }],
    defaultQuota: 20000,
    costWeight: 2,
    signalPriority: 11,
    notes: 'Website visitor de-anonymization — repeat-visit intent signals.',
  },
];

export const PLATFORMS_BY_ID: Record<string, Platform> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p]),
);

/** Platforms that participate in the contact/email waterfall, cheapest first. */
export const WATERFALL_ORDER: Platform[] = PLATFORMS.filter(
  (p) => p.enrichment && p.waterfallRank,
).sort((a, b) => (a.waterfallRank ?? 99) - (b.waterfallRank ?? 99));

/** Signal-source platforms sorted by signal generation priority (1 = highest). */
export const SIGNAL_PRIORITY_ORDER: Platform[] = PLATFORMS.filter(
  (p) => p.signalPriority != null,
).sort((a, b) => (a.signalPriority ?? 99) - (b.signalPriority ?? 99));

export function platformsByCategory(): Record<string, Platform[]> {
  const out: Record<string, Platform[]> = {};
  for (const p of PLATFORMS) (out[p.category] ??= []).push(p);
  return out;
}
