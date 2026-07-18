/**
 * Free/free-tier source registry for Room 3 and Room 4.
 *
 * Hard rule:
 * - Category B is reserved for a source whose provider explicitly permits the
 *   intended high-volume use through one account/integration. Category B is
 *   always capped at exactly one connection.
 * - Sources that do not permit that model may use independently owned and
 *   independently authorized partner connections only where the provider
 *   permits it. Connections are never rotated or combined to bypass quotas.
 * - Public research sources without accounts remain conservative, rate-limited
 *   research collectors and are not treated as bulk-scraping sources.
 */

export type FreeRoom = 'referrals_room' | 'community_monitoring_room';
export type AccessModel =
  | 'category_b_single_bulk_account'
  | 'partner_owned_pool'
  | 'manual_only'
  | 'authorized_workspace_app'
  | 'single_public_research'
  | 'internal_singleton';

export interface FreeRoomSource {
  id: string;
  name: string;
  room: FreeRoom;
  cost: 'free' | 'free_tier';
  accessModel: AccessModel;
  maxPartnerAccounts: number;
  apiOriented: boolean;
  requiresApproval: boolean;
  bulkSingleAccountPermitted: boolean;
  purpose: string;
  notes: string;
}

const source = (item: FreeRoomSource): FreeRoomSource => {
  if (item.accessModel === 'category_b_single_bulk_account') {
    if (!item.bulkSingleAccountPermitted || item.maxPartnerAccounts !== 1) {
      throw new Error(`Invalid Category B policy for ${item.id}.`);
    }
  } else if (item.bulkSingleAccountPermitted) {
    throw new Error(`${item.id} declares bulk permission outside Category B.`);
  }
  return item;
};

export const FREE_ROOM_SOURCES: FreeRoomSource[] = [
  // Room 3 — referrals
  source({
    id: 'google_search', name: 'Google Search / Research', room: 'referrals_room', cost: 'free',
    accessModel: 'single_public_research', maxPartnerAccounts: 1, apiOriented: false, requiresApproval: false,
    bulkSingleAccountPermitted: false,
    purpose: 'Find agency referral, overflow, white-label, hiring and recent-client-win signals.',
    notes: 'Conservative research only. This is not classified as bulk scraping; obey provider terms, robots, crawl budgets, caching and backoff.',
  }),
  source({
    id: 'google_alerts', name: 'Google Alerts', room: 'referrals_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 30, apiOriented: false, requiresApproval: true,
    bulkSingleAccountPermitted: false,
    purpose: 'Receive operator-configured referral and agency-capacity alerts.',
    notes: 'Each contributor uses an account they own and is authorized to use. Ingest forwarded alerts or manual exports.',
  }),
  source({
    id: 'clutch_basic', name: 'Clutch Basic', room: 'referrals_room', cost: 'free',
    accessModel: 'single_public_research', maxPartnerAccounts: 1, apiOriented: false, requiresApproval: false,
    bulkSingleAccountPermitted: false,
    purpose: 'Agency directory, review, portfolio and credibility signals.',
    notes: 'Public research only; no heavy-bulk classification unless written provider permission is recorded later.',
  }),
  source({
    id: 'goodfirms_basic', name: 'GoodFirms Basic', room: 'referrals_room', cost: 'free',
    accessModel: 'single_public_research', maxPartnerAccounts: 1, apiOriented: false, requiresApproval: false,
    bulkSingleAccountPermitted: false,
    purpose: 'Agency directory and review-backed partnership candidates.',
    notes: 'Public research only; preserve source URLs and use conservative collection limits.',
  }),
  source({
    id: 'g2_basic', name: 'G2 Basic', room: 'referrals_room', cost: 'free',
    accessModel: 'single_public_research', maxPartnerAccounts: 1, apiOriented: false, requiresApproval: false,
    bulkSingleAccountPermitted: false,
    purpose: 'Review, technology and market-presence signals.',
    notes: 'Public/basic access only; paid partner APIs are not part of the free room.',
  }),
  source({
    id: 'linkedin_manual', name: 'LinkedIn Manual', room: 'referrals_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 30, apiOriented: false, requiresApproval: true,
    bulkSingleAccountPermitted: false,
    purpose: 'Human-reviewed agency hiring, client-win, leadership and capacity signals.',
    notes: 'Each contributor uses their own account manually. No automated login, credential sharing, pooling or quota rotation.',
  }),
  source({
    id: 'upwork_manual', name: 'Upwork Manual / Saved Searches', room: 'referrals_room', cost: 'free_tier',
    accessModel: 'manual_only', maxPartnerAccounts: 30, apiOriented: false, requiresApproval: true,
    bulkSingleAccountPermitted: false,
    purpose: 'Detect agencies already outsourcing or posting overflow work.',
    notes: 'Manual evidence and permitted public research only.',
  }),
  source({
    id: 'apollo_free', name: 'Apollo Free Tier', room: 'referrals_room', cost: 'free_tier',
    accessModel: 'partner_owned_pool', maxPartnerAccounts: 30, apiOriented: true, requiresApproval: true,
    bulkSingleAccountPermitted: false,
    purpose: 'Secondary referral qualification and light signal hints; primarily enrichment-oriented.',
    notes: 'Every connection must have a distinct owner and consent. Never aggregate credits or rotate accounts to bypass limits.',
  }),

  // Room 4 — community monitoring
  source({
    id: 'x_advanced_search', name: 'X Advanced Search', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 30, apiOriented: false, requiresApproval: true,
    bulkSingleAccountPermitted: false,
    purpose: 'Find public agency pain, recommendation, outsourcing and buying-intent posts.',
    notes: 'Manual/browser search only; each contributor uses their own account.',
  }),
  source({
    id: 'x_lists', name: 'X Lists', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 30, apiOriented: false, requiresApproval: true,
    bulkSingleAccountPermitted: false,
    purpose: 'Monitor curated agency owners and decision-makers.',
    notes: 'Partner-owned lists with human-reviewed output.',
  }),
  source({
    id: 'reddit_api', name: 'Reddit API', room: 'community_monitoring_room', cost: 'free_tier',
    accessModel: 'partner_owned_pool', maxPartnerAccounts: 30, apiOriented: true, requiresApproval: true,
    bulkSingleAccountPermitted: false,
    purpose: 'Monitor approved subreddits for lead-convertible business signals.',
    notes: 'Each app/account must be independently authorized and used within its own limits; no quota pooling or rotation.',
  }),
  source({
    id: 'f5bot', name: 'F5Bot', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 30, apiOriented: false, requiresApproval: true,
    bulkSingleAccountPermitted: false,
    purpose: 'Receive keyword alerts from Reddit and supported sources.',
    notes: 'Ingest alerts from contributor-controlled mailboxes or manual exports.',
  }),
  source({
    id: 'praw', name: 'PRAW / Async PRAW', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'partner_owned_pool', maxPartnerAccounts: 30, apiOriented: true, requiresApproval: true,
    bulkSingleAccountPermitted: false,
    purpose: 'Reddit client implementation for approved monitoring.',
    notes: 'The library is free; underlying Reddit account, application and rate-limit rules still apply.',
  }),
  source({
    id: 'discord_bot', name: 'Discord Bot + discord.py', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'authorized_workspace_app', maxPartnerAccounts: 30, apiOriented: true, requiresApproval: true,
    bulkSingleAccountPermitted: false,
    purpose: 'Monitor only servers/channels where a bot is explicitly installed and authorized.',
    notes: 'One authorized installation per server/workspace as needed; no self-bots or user-token automation.',
  }),
  source({
    id: 'slack_app', name: 'Slack App', room: 'community_monitoring_room', cost: 'free_tier',
    accessModel: 'authorized_workspace_app', maxPartnerAccounts: 30, apiOriented: true, requiresApproval: true,
    bulkSingleAccountPermitted: false,
    purpose: 'Monitor only approved workspaces and channels for referral or buying-intent signals.',
    notes: 'One authorized installation per workspace; respect scopes, retention and provider limits.',
  }),
  source({
    id: 'n8n_self_hosted', name: 'n8n Self-Hosted', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'internal_singleton', maxPartnerAccounts: 1, apiOriented: true, requiresApproval: false,
    bulkSingleAccountPermitted: false,
    purpose: 'Orchestrate approved alerts, webhooks and room-ingestion workflows.',
    notes: 'One shared internal deployment; upstream provider limits still apply.',
  }),
  source({
    id: 'google_community_research', name: 'Google Search / Alerts', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'single_public_research', maxPartnerAccounts: 1, apiOriented: false, requiresApproval: false,
    bulkSingleAccountPermitted: false,
    purpose: 'Discover public community posts and corroborating evidence.',
    notes: 'Conservative research with source links, caching and backoff; not classified as heavy bulk scraping.',
  }),
  source({
    id: 'facebook_groups_manual', name: 'Facebook Groups Manual Monitoring', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 30, apiOriented: false, requiresApproval: true,
    bulkSingleAccountPermitted: false,
    purpose: 'Human monitoring of groups each contributor is authorized to access.',
    notes: 'No automated login rotation or private-group scraping.',
  }),
];

export function freeSourcesForRoom(room: FreeRoom) {
  return FREE_ROOM_SOURCES.filter((item) => item.room === room);
}

export function validatePartnerAccountCount(sourceId: string, requested: number) {
  const item = FREE_ROOM_SOURCES.find((candidate) => candidate.id === sourceId);
  if (!item) throw new Error(`Unknown free-room source: ${sourceId}`);
  if (!Number.isInteger(requested) || requested < 1 || requested > item.maxPartnerAccounts) {
    throw new Error(`${item.name} permits at most ${item.maxPartnerAccounts} configured connection(s) in this system.`);
  }
  if (item.accessModel === 'category_b_single_bulk_account' && requested !== 1) {
    throw new Error(`Category B source ${item.name} is hard-capped at one account.`);
  }
  if (item.accessModel === 'single_public_research' || item.accessModel === 'internal_singleton') {
    if (requested !== 1) throw new Error(`${item.name} uses exactly one shared connector.`);
  }
  return item;
}
