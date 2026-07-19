import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { googleResearch, buildSignalQueries } from '../research/google.js';
import type { RoomMode } from '../core/rooms.js';
import { RunContext } from '../core/runContext.js';

export interface CollectorStrategy {
  id: string;
  product: string;
  pains: string[];
  signals: string[];
  industries: string[];
  country: string;
  regions?: string[];
  positiveKeywords?: string[];
  negativeKeywords?: string[];
  maxEmployees?: number;
}

export interface CollectedSignal {
  sourceId: string;
  title: string;
  rawText: string;
  url: string;
  companyName?: string;
  publishedAt?: string;
  author?: string;
  location?: string;
  hypotheses?: string[];
  rationale?: string;
  relevance?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface SourceRunConfig {
  maxResults?: number;
  subreddits?: string[];
  queries?: string[];
  discord?: { botToken?: string; channelIds?: string[] };
  slack?: { botToken?: string; channelIds?: string[] };
  reddit?: { accessToken?: string; userAgent?: string };
}

const LEAD_CUES = [
  'need', 'looking for', 'recommend', 'partner', 'overflow', 'outsource', 'subcontract',
  'white label', 'capacity', 'cannot keep up', "can't keep up", 'overwhelmed', 'swamped',
  'hiring', 'help with', 'struggling', 'pain', 'problem', 'replace', 'alternative',
  'vendor', 'agency', 'automation', 'manual process', 'too much work', 'new client',
];

function cleanText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function scoreCandidate(text: string, strategy: CollectorStrategy) {
  const lower = text.toLowerCase();
  const positive = [
    ...(strategy.positiveKeywords ?? []),
    ...strategy.pains,
    ...strategy.signals,
    ...strategy.industries,
    ...LEAD_CUES,
  ].map((x) => x.toLowerCase()).filter(Boolean);
  const negative = (strategy.negativeKeywords ?? []).map((x) => x.toLowerCase());
  if (negative.some((x) => lower.includes(x))) return { relevance: 0, hypotheses: ['excluded_by_strategy'] };

  const matched = [...new Set(positive.filter((x) => lower.includes(x)))];
  // Targeted source/query context itself is evidence. Unknown wording is retained
  // rather than rejected, preserving open-world signal discovery.
  const relevance = Math.min(100, 35 + matched.length * 8);
  const hypotheses = matched.slice(0, 8).map((x) => `possible:${x}`);
  if (!hypotheses.length) hypotheses.push('open_world_lead_candidate');
  return { relevance, hypotheses };
}

function domainFromUrl(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

export class SignalCollectorService {
  constructor(private db: Database.Database) {}

  loadStrategy(strategyId: string): CollectorStrategy {
    const row = this.db.prepare(`SELECT strategy_json FROM strategies WHERE id=?`).get(strategyId) as { strategy_json: string } | undefined;
    if (!row) throw new Error(`Strategy not found: ${strategyId}`);
    const raw = JSON.parse(row.strategy_json || '{}');
    return {
      id: strategyId,
      product: cleanText(raw.product?.name ?? raw.product ?? raw.offer ?? 'agentic systems and SaaS'),
      pains: raw.product?.painsSolved ?? raw.pains ?? raw.painPoints ?? [],
      signals: raw.signalFilters?.include ?? raw.signals ?? raw.preferredSignals ?? [],
      industries: raw.icp?.industries ?? raw.industries ?? [],
      country: raw.geography?.countries?.[0] ?? raw.country ?? 'US',
      regions: raw.geography?.regions ?? raw.regions ?? [],
      positiveKeywords: raw.signalFilters?.positiveKeywords ?? raw.positiveKeywords ?? [],
      negativeKeywords: raw.signalFilters?.negativeKeywords ?? raw.negativeKeywords ?? [],
      maxEmployees: raw.icp?.employeeRange?.max ?? raw.maxEmployees ?? 500,
    };
  }

  async run(room: RoomMode, sourceId: string, strategy: CollectorStrategy, config: SourceRunConfig = {}, ctx?: RunContext) {
    const context = ctx ?? new RunContext('test');
    // TEST MODE: never touch the network. Produce deterministic, clearly-marked
    // synthetic candidates so the full workflow can be exercised without keys.
    if (context.isTest) return this.synthesize(sourceId, strategy, config, context);

    switch (sourceId) {
      case 'signal_discovery':
        return this.collectSignalDiscovery(strategy, config, context);
      case 'google_search':
        return this.collectGoogleReferrals(strategy, config, context);
      case 'clutch_basic':
        return this.collectDirectory('clutch.co', 'Clutch', strategy, config, context);
      case 'goodfirms_basic':
        return this.collectDirectory('goodfirms.co', 'GoodFirms', strategy, config, context);
      case 'g2_basic':
        return this.collectDirectory('g2.com', 'G2', strategy, config, context);
      case 'google_community_research':
        return this.collectGoogleCommunities(strategy, config, context);
      case 'reddit_api':
      case 'praw':
        return this.collectReddit(strategy, config, context);
      case 'discord_bot':
        return this.collectDiscord(strategy, config, context);
      case 'slack_app':
        return this.collectSlack(strategy, config, context);
      case 'n8n_self_hosted':
      case 'google_alerts':
      case 'f5bot':
      case 'linkedin_manual':
      case 'upwork_manual':
      case 'x_advanced_search':
      case 'x_lists':
      case 'facebook_groups_manual':
      case 'apollo_free':
        return [];
      default:
        throw new Error(`Collector not implemented for source: ${sourceId}`);
    }
  }

  /**
   * Deterministic synthetic discovery for TEST MODE. Derives believable, source-
   * linked candidate signals from the strategy so operators can validate the
   * entire pipeline (discovery → selection → enrichment → lead) at zero cost.
   * Every synthetic signal is explicitly flagged so it can never be mistaken for
   * real, verified evidence.
   */
  private synthesize(sourceId: string, strategy: CollectorStrategy, config: SourceRunConfig, ctx: RunContext): CollectedSignal[] {
    const count = Math.min(Math.max(1, config.maxResults ?? 6), 12);
    const industries = strategy.industries.length ? strategy.industries : ['SME'];
    const pains = strategy.pains.length ? strategy.pains : ['manual processes'];
    const signals = strategy.signals.length ? strategy.signals : ['hiring'];
    const suffixes = ['Logistics', 'Systems', 'Group', 'Labs', 'Partners', 'Collective', 'Works', 'Digital', 'Studio', 'Co'];
    const out: CollectedSignal[] = [];
    for (let i = 0; i < count; i++) {
      const seed = crypto.createHash('md5').update(`${sourceId}|${strategy.id}|${i}`).digest();
      const industry = industries[seed[0] % industries.length];
      const pain = pains[seed[1] % pains.length];
      const signal = signals[seed[2] % signals.length];
      const company = `${industry.split(/\s+/)[0]} ${suffixes[seed[3] % suffixes.length]}`;
      const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      out.push({
        sourceId,
        title: `${company} — ${signal} signal (${industry})`,
        rawText: `${company} shows a "${signal}" signal; likely ${pain}. Synthetic test candidate for pipeline validation.`,
        url: `https://test-signals.local/${sourceId}/${slug}-${seed.toString('hex').slice(0, 8)}`,
        companyName: company,
        confidence: 40,
        relevance: 45 + (seed[4] % 40),
        hypotheses: [`possible:${signal}`, `possible:${pain}`],
        rationale: 'TEST MODE synthetic candidate — no external source was contacted.',
        metadata: { synthetic: true, mode: 'test', industry },
      });
      ctx.recordSynthesized();
    }
    return out;
  }

  persist(room: RoomMode, strategy: CollectorStrategy, signals: CollectedSignal[]) {
    const insert = this.db.prepare(`INSERT OR IGNORE INTO signal_events
      (strategy_id,signal_code,title,raw_text,source_id,source_url,source_domain,published_at,
       company_name_raw,relevance,confidence,verification_status,evidence_json,event_hash,status,
       room_origin,source_links_json,signal_hypotheses_json,rationale,sme_fit)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

    let inserted = 0;
    const tx = this.db.transaction(() => {
      for (const signal of signals) {
        if (!signal.url || !/^https?:\/\//i.test(signal.url)) continue;
        const scored = scoreCandidate(`${signal.title} ${signal.rawText}`, strategy);
        if (scored.relevance <= 0) continue;
        const hypotheses = signal.hypotheses?.length ? signal.hypotheses : scored.hypotheses;
        const hash = crypto.createHash('sha256')
          .update(`${room}|${signal.sourceId}|${signal.url}|${signal.title}`.toLowerCase())
          .digest('hex');
        const evidence = {
          text: signal.rawText,
          author: signal.author,
          metadata: signal.metadata,
          capturedAt: new Date().toISOString(),
        };
        const info = insert.run(
          strategy.id,
          hypotheses[0] ?? null,
          signal.title,
          signal.rawText,
          signal.sourceId,
          signal.url,
          domainFromUrl(signal.url),
          signal.publishedAt ?? null,
          signal.companyName ?? null,
          signal.relevance ?? scored.relevance,
          signal.confidence ?? 55,
          'unverified',
          JSON.stringify(evidence),
          hash,
          'candidate',
          room,
          JSON.stringify([{ label: signal.title, url: signal.url, sourceType: 'social', capturedAt: new Date().toISOString() }]),
          JSON.stringify(hypotheses),
          signal.rationale ?? 'Captured because the targeted source/query may indicate a lead-convertible business event.',
          'unknown',
        );
        inserted += Number(info.changes || 0);
      }
    });
    tx();
    return inserted;
  }

  ingestImported(room: RoomMode, sourceId: string, strategy: CollectorStrategy, items: unknown[]) {
    const signals = items.map((item: any): CollectedSignal => ({
      sourceId,
      title: cleanText(item.title || item.subject || item.name || 'Imported signal'),
      rawText: cleanText(item.rawText || item.text || item.body || item.snippet || item.description),
      url: cleanText(item.url || item.link || item.sourceUrl),
      companyName: cleanText(item.companyName || item.company || item.organization) || undefined,
      publishedAt: item.publishedAt || item.createdAt || item.timestamp,
      author: cleanText(item.author || item.user || item.sender) || undefined,
      hypotheses: Array.isArray(item.hypotheses) ? item.hypotheses : undefined,
      rationale: cleanText(item.rationale) || undefined,
      metadata: item.metadata,
    })).filter((x) => x.rawText && x.url);
    return { received: items.length, valid: signals.length, inserted: this.persist(room, strategy, signals) };
  }

  /**
   * Room 1 — open-world Signal Discovery. Strategy-driven web research through
   * the production crawl engine (cache/retry/anti-bot/metrics all apply). Builds
   * signal-oriented queries from the strategy and returns lead-convertible
   * candidates, each carrying its source link for human credibility review.
   */
  private async collectSignalDiscovery(strategy: CollectorStrategy, config: SourceRunConfig, ctx: RunContext) {
    const queries = config.queries?.length ? config.queries : buildSignalQueries({
      product: strategy.product,
      pains: strategy.pains,
      signals: strategy.signals,
      industries: strategy.industries,
      country: strategy.country,
    });
    const signals = await this.googleQueries('signal_discovery', queries, strategy, config.maxResults ?? 10, ctx);
    return signals.map((s) => ({ ...s, rationale: s.rationale ?? 'Discovered via strategy-targeted public web research; may indicate a lead-convertible business event.' }));
  }

  private async collectGoogleReferrals(strategy: CollectorStrategy, config: SourceRunConfig, ctx: RunContext) {
    const queries = config.queries?.length ? config.queries : buildSignalQueries({
      product: strategy.product,
      pains: strategy.pains,
      signals: strategy.signals,
      industries: strategy.industries,
      country: strategy.country,
    });
    return this.googleQueries('google_search', queries, strategy, config.maxResults ?? 10, ctx);
  }

  private async collectDirectory(domain: string, name: string, strategy: CollectorStrategy, config: SourceRunConfig, ctx: RunContext) {
    const industries = strategy.industries.length ? strategy.industries : ['digital marketing agency', 'software agency'];
    const queries = config.queries?.length ? config.queries : industries.slice(0, 5).map((industry) =>
      `site:${domain} "${industry}" (${strategy.country}) (reviews OR portfolio OR hiring OR partner OR overflow)`
    );
    return this.googleQueries(`${name.toLowerCase()}_basic`, queries, strategy, config.maxResults ?? 10, ctx);
  }

  private async collectGoogleCommunities(strategy: CollectorStrategy, config: SourceRunConfig, ctx: RunContext) {
    const cue = [...strategy.signals, ...strategy.pains, 'need a partner', 'anyone recommend', 'overflow', 'outsource']
      .slice(0, 10).map((x) => `"${x}"`).join(' OR ');
    const queries = config.queries?.length ? config.queries : [
      `site:reddit.com (${cue}) (${strategy.industries.join(' OR ') || 'agency OR SME'})`,
      `site:x.com (${cue}) (${strategy.industries.join(' OR ') || 'agency OR business'})`,
      `site:facebook.com/groups (${cue}) (${strategy.industries.join(' OR ') || 'agency'})`,
    ];
    return this.googleQueries('google_community_research', queries, strategy, config.maxResults ?? 10, ctx);
  }

  /** Budget-aware Google research: each query is one external call charged to the
   *  run ceiling; when the ceiling is reached, remaining queries are skipped. */
  private async googleQueries(sourceId: string, queries: string[], strategy: CollectorStrategy, maxResults: number, ctx: RunContext) {
    const out: CollectedSignal[] = [];
    for (const query of queries.slice(0, 8)) {
      if (!ctx.charge(sourceId, 0)) break; // global ceiling reached
      try {
        const rows = await googleResearch({ query, country: strategy.country, maxResults: Math.min(maxResults, 20), freshness: 'month' });
        ctx.recordResult(sourceId, true);
        for (const row of rows) {
          out.push({ sourceId, title: row.title, rawText: row.snippet || row.title, url: row.url, companyName: row.displayedDomain, confidence: 50, metadata: { displayedDomain: row.displayedDomain } });
        }
      } catch {
        ctx.recordResult(sourceId, false);
      }
    }
    return out;
  }

  private async collectReddit(strategy: CollectorStrategy, config: SourceRunConfig, ctx: RunContext) {
    const subreddits = config.subreddits?.length ? config.subreddits : ['marketing', 'SEO', 'digital_marketing', 'smallbusiness', 'Entrepreneur', 'agency', 'LeadGeneration'];
    const limit = Math.min(config.maxResults ?? 25, 100);
    const headers: Record<string, string> = { 'User-Agent': config.reddit?.userAgent || 'AlchemistSignalForge/1.0' };
    if (config.reddit?.accessToken) headers.Authorization = `Bearer ${config.reddit.accessToken}`;
    const base = config.reddit?.accessToken ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
    const out: CollectedSignal[] = [];
    for (const subreddit of subreddits.slice(0, 20)) {
      if (!ctx.charge('reddit_api', 0)) break;
      try {
        const response = await fetch(`${base}/r/${encodeURIComponent(subreddit)}/new.json?limit=${limit}`, { headers });
        if (!response.ok) { ctx.recordResult('reddit_api', false); continue; }
        const json: any = await response.json();
        ctx.recordResult('reddit_api', true);
        for (const child of json?.data?.children ?? []) {
          const post = child.data;
          out.push({
            sourceId: 'reddit_api', title: cleanText(post.title), rawText: cleanText(`${post.title} ${post.selftext || ''}`),
            url: `https://www.reddit.com${post.permalink}`, author: post.author,
            publishedAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : undefined,
            confidence: 60, metadata: { subreddit: post.subreddit, score: post.score, comments: post.num_comments },
          });
        }
      } catch { ctx.recordResult('reddit_api', false); }
    }
    return out;
  }

  private async collectDiscord(_strategy: CollectorStrategy, config: SourceRunConfig, ctx: RunContext) {
    const token = config.discord?.botToken || process.env.DISCORD_BOT_TOKEN;
    const channelIds = config.discord?.channelIds ?? [];
    if (!token || !channelIds.length) return [];
    const out: CollectedSignal[] = [];
    for (const channelId of channelIds.slice(0, 100)) {
      if (!ctx.charge('discord_bot', 0)) break;
      try {
        const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=${Math.min(config.maxResults ?? 50, 100)}`, { headers: { Authorization: `Bot ${token}` } });
        if (!response.ok) { ctx.recordResult('discord_bot', false); continue; }
        const rows: any[] = await response.json();
        ctx.recordResult('discord_bot', true);
        for (const row of rows.filter((r) => r.content)) {
          out.push({
            sourceId: 'discord_bot', title: `Discord message from ${row.author?.username ?? 'member'}`, rawText: cleanText(row.content),
            url: `https://discord.com/channels/@me/${channelId}/${row.id}`, author: row.author?.username,
            publishedAt: row.timestamp, confidence: 65, metadata: { channelId, messageId: row.id },
          });
        }
      } catch { ctx.recordResult('discord_bot', false); }
    }
    return out;
  }

  private async collectSlack(_strategy: CollectorStrategy, config: SourceRunConfig, ctx: RunContext) {
    const token = config.slack?.botToken || process.env.SLACK_BOT_TOKEN;
    const channelIds = config.slack?.channelIds ?? [];
    if (!token || !channelIds.length) return [];
    const out: CollectedSignal[] = [];
    for (const channelId of channelIds.slice(0, 100)) {
      if (!ctx.charge('slack_app', 0)) break;
      try {
        const params = new URLSearchParams({ channel: channelId, limit: String(Math.min(config.maxResults ?? 100, 200)) });
        const response = await fetch(`https://slack.com/api/conversations.history?${params}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) { ctx.recordResult('slack_app', false); continue; }
        const json: any = await response.json();
        if (!json.ok) { ctx.recordResult('slack_app', false); continue; }
        ctx.recordResult('slack_app', true);
        for (const row of (json.messages ?? []).filter((r: any) => r.text)) {
          out.push({
            sourceId: 'slack_app', title: `Slack message in ${channelId}`, rawText: cleanText(row.text),
            url: `https://slack.com/app_redirect?channel=${encodeURIComponent(channelId)}&message_ts=${encodeURIComponent(row.ts)}`,
            author: row.user, publishedAt: row.ts ? new Date(Number(row.ts) * 1000).toISOString() : undefined,
            confidence: 70, metadata: { channelId, ts: row.ts, threadTs: row.thread_ts },
          });
        }
      } catch { ctx.recordResult('slack_app', false); }
    }
    return out;
  }
}
