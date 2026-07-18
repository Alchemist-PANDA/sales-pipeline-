/**
 * Free/free-tier source registry for Room 3 and Room 4.
 *
 * Account categories:
 * - Category B: exactly one account/integration, and only when the provider
 *   explicitly permits the intended heavy-volume collection through it.
 * - Partner pool: one shared system may hold up to 30 independently owned
 *   connections (15 live + 15 standby) for limited-credit/free-tier sources.
 * - Public research: one conservative collector; this is not automatically
 *   classified as heavy-volume collection.
 * - Manual/authorized workspace sources: evidence is contributed manually or
 *   through an authorized app/bot installation.
 */

export type FreeRoom = 'referrals_room' | 'community_monitoring_room';
export type AccessModel =
  | 'category_b_single_bulk_account'
  | 'partner_owned_pool'
  | 'manual_only'
  | 'authorized_workspace_app'
  | 'single_public_research'
  | 'internal_singleton';

export type ConnectionState = 'live' | 'standby' | 'disabled';

export interface FreeRoomSource {
  id: string;
  name: string;
  room: FreeRoom;
  cost: 'free' | 'free_tier';
  accessModel: AccessModel;
  maxPartnerAccounts: number;
  defaultLiveAccounts: number;
  defaultStandbyAccounts: number;
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

  if (item.maxPartnerAccounts === 30) {
    if (item.defaultLiveAccounts !== 15 || item.defaultStandbyAccounts !== 15) {
      throw new Error(`${item.id} must use the agreed 15-live / 15-standby layout.`);
    }
  } else if (item.defaultLiveAccounts + item.defaultStandbyAccounts > item.maxPartnerAccounts) {
    throw new Error(`Invalid default account layout for ${item.id}.`);
  }

  return item;
};

export const FREE_ROOM_SOURCES: FreeRoomSource[] = [
  // Room 3 — Agency Referrals
  source({
    id: 'google_search', name: 'Google Search / Research', room: 'referrals_room', cost: 'free',
    accessModel: 'single_public_research', maxPartnerAccounts: 1, defaultLiveAccounts: 1, defaultStandbyAccounts: 0,
    apiOriented: false, requiresApproval: false, bulkSingleAccountPermitted: false,
    purpose: 'Find agency referral, overflow, white-label, hiring and recent-client-win signals.',
    notes: 'One conservative shared collector with caching, crawl budgets and backoff.',
  }),
  source({
    id: 'google_alerts', name: 'Google Alerts', room: 'referrals_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 30, defaultLiveAccounts: 15, defaultStandbyAccounts: 15,
    apiOriented: false, requiresApproval: true, bulkSingleAccountPermitted: false,
    purpose: 'Receive operator-configured referral and agency-capacity alerts.',
    notes: 'Thirty contributor connections in one system; alerts enter through imports or forwarding.',
  }),
  source({
    id: 'clutch_basic', name: 'Clutch Basic', room: 'referrals_room', cost: 'free',
    accessModel: 'single_public_research', maxPartnerAccounts: 1, defaultLiveAccounts: 1, defaultStandbyAccounts: 0,
    apiOriented: false, requiresApproval: false, bulkSingleAccountPermitted: false,
    purpose: 'Agency directory, review, portfolio and credibility signals.',
    notes: 'Public research only; preserve evidence URLs.',
  }),
  source({
    id: 'goodfirms_basic', name: 'GoodFirms Basic', room: 'referrals_room', cost: 'free',
    accessModel: 'single_public_research', maxPartnerAccounts: 1, defaultLiveAccounts: 1, defaultStandbyAccounts: 0,
    apiOriented: false, requiresApproval: false, bulkSingleAccountPermitted: false,
    purpose: 'Agency directory and review-backed partnership candidates.',
    notes: 'Public research only; preserve evidence URLs.',
  }),
  source({
    id: 'g2_basic', name: 'G2 Basic', room: 'referrals_room', cost: 'free',
    accessModel: 'single_public_research', maxPartnerAccounts: 1, defaultLiveAccounts: 1, defaultStandbyAccounts: 0,
    apiOriented: false, requiresApproval: false, bulkSingleAccountPermitted: false,
    purpose: 'Review, technology-stack and market-presence signals.',
    notes: 'Public/basic access only; paid partner APIs are optional future modules.',
  }),
  source({
    id: 'linkedin_manual', name: 'LinkedIn Manual', room: 'referrals_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 30, defaultLiveAccounts: 15, defaultStandbyAccounts: 15,
    apiOriented: false, requiresApproval: true, bulkSingleAccountPermitted: false,
    purpose: 'Human-reviewed agency hiring, client-win, leadership and capacity signals.',
    notes: 'Thirty individually owned contributor accounts managed through one shared system.',
  }),
  source({
    id: 'upwork_manual', name: 'Upwork Manual / Saved Searches', room: 'referrals_room', cost: 'free_tier',
    accessModel: 'manual_only', maxPartnerAccounts: 30, defaultLiveAccounts: 15, defaultStandbyAccounts: 15,
    apiOriented: false, requiresApproval: true, bulkSingleAccountPermitted: false,
    purpose: 'Detect agencies already outsourcing or posting overflow work.',
    notes: 'Manual evidence and saved-search contribution workflow.',
  }),
  source({
    id: 'apollo_free', name: 'Apollo Free Tier', room: 'referrals_room', cost: 'free_tier',
    accessModel: 'partner_owned_pool', maxPartnerAccounts: 30, defaultLiveAccounts: 15, defaultStandbyAccounts: 15,
    apiOriented: true, requiresApproval: true, bulkSingleAccountPermitted: false,
    purpose: 'Secondary qualification and enrichment evidence for selected referral signals.',
    notes: 'One shared system; thirty separately owned connections; fifteen live and fifteen standby.',
  }),
  source({
    id: 'hunter_free', name: 'Hunter Free Tier', room: 'referrals_room', cost: 'free_tier',
    accessModel: 'partner_owned_pool', maxPartnerAccounts: 30, defaultLiveAccounts: 15, defaultStandbyAccounts: 15,
    apiOriented: true, requiresApproval: true, bulkSingleAccountPermitted: false,
    purpose: 'Email discovery or verification evidence for signals selected for enrichment.',
    notes: 'Registered as a limited-credit provider pool; actual use belongs in Room 2 enrichment.',
  }),

  // Room 4 — Community Monitoring
  source({
    id: 'x_advanced_search', name: 'X Advanced Search', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 30, defaultLiveAccounts: 15, defaultStandbyAccounts: 15,
    apiOriented: false, requiresApproval: true, bulkSingleAccountPermitted: false,
    purpose: 'Find public business pain, recommendations, outsourcing and buying-intent posts.',
    notes: 'Manual/browser search with source-link import.',
  }),
  source({
    id: 'x_lists', name: 'X Lists', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 30, defaultLiveAccounts: 15, defaultStandbyAccounts: 15,
    apiOriented: false, requiresApproval: true, bulkSingleAccountPermitted: false,
    purpose: 'Monitor curated agency owners and SME decision-makers.',
    notes: 'Partner-owned lists with human-reviewed output.',
  }),
  source({
    id: 'reddit_api', name: 'Reddit API', room: 'community_monitoring_room', cost: 'free_tier',
    accessModel: 'partner_owned_pool', maxPartnerAccounts: 30, defaultLiveAccounts: 15, defaultStandbyAccounts: 15,
    apiOriented: true, requiresApproval: true, bulkSingleAccountPermitted: false,
    purpose: 'Monitor selected subreddits for lead-convertible business signals.',
    notes: 'Thirty configurable connections in one shared system.',
  }),
  source({
    id: 'praw', name: 'PRAW / Async PRAW', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'partner_owned_pool', maxPartnerAccounts: 30, defaultLiveAccounts: 15, defaultStandbyAccounts: 15,
    apiOriented: true, requiresApproval: true, bulkSingleAccountPermitted: false,
    purpose: 'Reddit client implementation for monitored communities.',
    notes: 'Library is free; each configured connection has separate ownership and status.',
  }),
  source({
    id: 'f5bot', name: 'F5Bot', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 30, defaultLiveAccounts: 15, defaultStandbyAccounts: 15,
    apiOriented: false, requiresApproval: true, bulkSingleAccountPermitted: false,
    purpose: 'Receive keyword alerts from Reddit and supported sources.',
    notes: 'Alerts enter through an operator mailbox, import or webhook.',
  }),
  source({
    id: 'discord_bot', name: 'Discord Bot', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'authorized_workspace_app', maxPartnerAccounts: 30, defaultLiveAccounts: 15, defaultStandbyAccounts: 15,
    apiOriented: true, requiresApproval: true, bulkSingleAccountPermitted: false,
    purpose: 'Read signal evidence from configured Discord channels.',
    notes: 'One shared application can manage thirty authorized installations/connections.',
  }),
  source({
    id: 'slack_app', name: 'Slack App', room: 'community_monitoring_room', cost: 'free_tier',
    accessModel: 'authorized_workspace_app', maxPartnerAccounts: 30, defaultLiveAccounts: 15, defaultStandbyAccounts: 15,
    apiOriented: true, requiresApproval: true, bulkSingleAccountPermitted: false,
    purpose: 'Read signal evidence from configured Slack channels.',
    notes: 'One shared application can manage thirty authorized workspace connections.',
  }),
  source({
    id: 'n8n_self_hosted', name: 'n8n Self-Hosted', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'internal_singleton', maxPartnerAccounts: 1, defaultLiveAccounts: 1, defaultStandbyAccounts: 0,
    apiOriented: true, requiresApproval: false, bulkSingleAccountPermitted: false,
    purpose: 'Orchestrate alerts, imports, webhooks and room ingestion workflows.',
    notes: 'One shared internal deployment.',
  }),
  source({
    id: 'google_community_research', name: 'Google Community Research', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'single_public_research', maxPartnerAccounts: 1, defaultLiveAccounts: 1, defaultStandbyAccounts: 0,
    apiOriented: false, requiresApproval: false, bulkSingleAccountPermitted: false,
    purpose: 'Discover indexed public community posts and corroborating evidence.',
    notes: 'One conservative shared collector with caching and backoff.',
  }),
  source({
    id: 'facebook_groups_manual', name: 'Facebook Groups Manual Monitoring', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 30, defaultLiveAccounts: 15, defaultStandbyAccounts: 15,
    apiOriented: false, requiresApproval: true, bulkSingleAccountPermitted: false,
    purpose: 'Human monitoring of relevant groups with evidence import.',
    notes: 'Thirty contributors use one shared system.',
  }),
];

export function freeSourcesForRoom(room: FreeRoom) {
  return FREE_ROOM_SOURCES.filter((item) => item.room === room);
}

export function validatePartnerAccountCount(sourceId: string, requested: number) {
  const item = FREE_ROOM_SOURCES.find((entry) => entry.id === sourceId);
  if (!item) throw new Error(`Unknown free-room source: ${sourceId}`);
  if (!Number.isInteger(requested) || requested < 1 || requested > item.maxPartnerAccounts) {
    throw new Error(`${item.name} permits at most ${item.maxPartnerAccounts} configured connection(s) in this system.`);
  }
  if (item.accessModel === 'category_b_single_bulk_account' && requested !== 1) {
    throw new Error(`${item.name} is Category B and must use exactly one integration.`);
  }
  return item;
}

export function defaultConnectionLayout(sourceId: string): { live: number; standby: number } {
  const item = FREE_ROOM_SOURCES.find((entry) => entry.id === sourceId);
  if (!item) throw new Error(`Unknown free-room source: ${sourceId}`);
  return { live: item.defaultLiveAccounts, standby: item.defaultStandbyAccounts };
}
