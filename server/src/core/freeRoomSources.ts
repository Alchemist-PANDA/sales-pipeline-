/**
 * Free-only source registry for Room 3 and Room 4.
 *
 * Compliance rule: the system never creates accounts automatically, shares
 * credentials, or rotates accounts to evade platform quotas. A partner-owned
 * pool is allowed only when each of the 30 partners connects their own account,
 * the platform permits that use, and limits remain enforced per account and at
 * organization level. Public/high-volume sources use one shared integration.
 */

export type FreeRoom = 'referrals_room' | 'community_monitoring_room';
export type AccessModel =
  | 'single_public_integration'
  | 'partner_owned_pool'
  | 'manual_only'
  | 'authorized_workspace_app';

export interface FreeRoomSource {
  id: string;
  name: string;
  room: FreeRoom;
  cost: 'free' | 'free_tier';
  accessModel: AccessModel;
  maxPartnerAccounts: number;
  apiOriented: boolean;
  requiresApproval: boolean;
  purpose: string;
  notes: string;
}

export const FREE_ROOM_SOURCES: FreeRoomSource[] = [
  // Room 3 — referrals
  {
    id: 'google_search', name: 'Google Search / Research', room: 'referrals_room', cost: 'free',
    accessModel: 'single_public_integration', maxPartnerAccounts: 1, apiOriented: false, requiresApproval: false,
    purpose: 'Find agency referral, overflow, white-label, hiring and recent-client-win signals.',
    notes: 'Conservative browser research only; obey robots, terms, crawl budgets and backoff.',
  },
  {
    id: 'google_alerts', name: 'Google Alerts', room: 'referrals_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 1, apiOriented: false, requiresApproval: false,
    purpose: 'Receive operator-configured referral and agency-capacity alerts.',
    notes: 'Ingest forwarded alert emails or manual exports; no account farming.',
  },
  {
    id: 'clutch_basic', name: 'Clutch Basic', room: 'referrals_room', cost: 'free',
    accessModel: 'single_public_integration', maxPartnerAccounts: 1, apiOriented: false, requiresApproval: false,
    purpose: 'Agency directory, review, portfolio and credibility signals.',
    notes: 'Use public pages conservatively and preserve source URLs.',
  },
  {
    id: 'goodfirms_basic', name: 'GoodFirms Basic', room: 'referrals_room', cost: 'free',
    accessModel: 'single_public_integration', maxPartnerAccounts: 1, apiOriented: false, requiresApproval: false,
    purpose: 'Agency directory and review-backed partnership candidates.',
    notes: 'Public research only.',
  },
  {
    id: 'g2_basic', name: 'G2 Basic', room: 'referrals_room', cost: 'free',
    accessModel: 'single_public_integration', maxPartnerAccounts: 1, apiOriented: false, requiresApproval: false,
    purpose: 'Review, technology and market-presence signals.',
    notes: 'Public/basic access only; paid partner APIs are not part of the free room.',
  },
  {
    id: 'linkedin_manual', name: 'LinkedIn Manual', room: 'referrals_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 30, apiOriented: false, requiresApproval: true,
    purpose: 'Human-reviewed agency hiring, client-win, leadership and capacity signals.',
    notes: 'No automated credential capture or account rotation; each partner uses their own authorized account.',
  },
  {
    id: 'upwork_manual', name: 'Upwork Manual / Saved Searches', room: 'referrals_room', cost: 'free_tier',
    accessModel: 'manual_only', maxPartnerAccounts: 30, apiOriented: false, requiresApproval: true,
    purpose: 'Detect agencies already outsourcing or posting overflow work.',
    notes: 'No production API assumption; manual evidence and Google-indexed public pages only.',
  },
  {
    id: 'apollo_free', name: 'Apollo Free Tier', room: 'referrals_room', cost: 'free_tier',
    accessModel: 'partner_owned_pool', maxPartnerAccounts: 30, apiOriented: true, requiresApproval: true,
    purpose: 'Secondary referral qualification and light signal hints; primarily enrichment-oriented.',
    notes: 'Each partner connects their own permitted free account. Never pool to bypass organization or platform limits.',
  },

  // Room 4 — community monitoring
  {
    id: 'x_advanced_search', name: 'X Advanced Search', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 30, apiOriented: false, requiresApproval: true,
    purpose: 'Find public agency pain, recommendation, outsourcing and buying-intent posts.',
    notes: 'Manual/browser search; no paid X API dependency.',
  },
  {
    id: 'x_lists', name: 'X Lists', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 30, apiOriented: false, requiresApproval: true,
    purpose: 'Monitor curated agency owners and decision-makers.',
    notes: 'Partner-owned lists; human-reviewed output.',
  },
  {
    id: 'reddit_api', name: 'Reddit API', room: 'community_monitoring_room', cost: 'free_tier',
    accessModel: 'partner_owned_pool', maxPartnerAccounts: 30, apiOriented: true, requiresApproval: true,
    purpose: 'Monitor approved subreddits for broad lead-convertible business signals.',
    notes: 'Use only where Reddit permits the application/use case; enforce per-app and global limits.',
  },
  {
    id: 'f5bot', name: 'F5Bot', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 1, apiOriented: false, requiresApproval: false,
    purpose: 'Receive keyword alerts from Reddit and supported sources.',
    notes: 'Ingest alerts through an operator-controlled mailbox or manual import.',
  },
  {
    id: 'praw', name: 'PRAW / Async PRAW', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'partner_owned_pool', maxPartnerAccounts: 30, apiOriented: true, requiresApproval: true,
    purpose: 'Reddit client implementation for approved monitoring.',
    notes: 'Library is free; underlying Reddit API policy still applies.',
  },
  {
    id: 'discord_bot', name: 'Discord Bot + discord.py', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'authorized_workspace_app', maxPartnerAccounts: 30, apiOriented: true, requiresApproval: true,
    purpose: 'Monitor only servers/channels where the bot is explicitly installed and authorized.',
    notes: 'No user-token automation, self-bots, credential sharing or unauthorized server monitoring.',
  },
  {
    id: 'slack_app', name: 'Slack App', room: 'community_monitoring_room', cost: 'free_tier',
    accessModel: 'authorized_workspace_app', maxPartnerAccounts: 30, apiOriented: true, requiresApproval: true,
    purpose: 'Monitor only approved workspaces and channels for referral/buying-intent signals.',
    notes: 'One installation per authorized workspace; respect scopes and retention rules.',
  },
  {
    id: 'n8n_self_hosted', name: 'n8n Self-Hosted', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'single_public_integration', maxPartnerAccounts: 1, apiOriented: true, requiresApproval: false,
    purpose: 'Orchestrate approved alerts, webhooks and room ingestion workflows.',
    notes: 'One shared internal deployment; provider limits remain upstream.',
  },
  {
    id: 'google_community_research', name: 'Google Search / Alerts', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'single_public_integration', maxPartnerAccounts: 1, apiOriented: false, requiresApproval: false,
    purpose: 'Discover public community posts and corroborating evidence.',
    notes: 'Conservative research with source links and caching.',
  },
  {
    id: 'facebook_groups_manual', name: 'Facebook Groups Manual Monitoring', room: 'community_monitoring_room', cost: 'free',
    accessModel: 'manual_only', maxPartnerAccounts: 30, apiOriented: false, requiresApproval: true,
    purpose: 'Human monitoring of groups each partner is authorized to access.',
    notes: 'No automated login rotation or private-group scraping.',
  },
];

export function freeSourcesForRoom(room: FreeRoom) {
  return FREE_ROOM_SOURCES.filter((source) => source.room === room);
}

export function validatePartnerAccountCount(sourceId: string, requested: number) {
  const source = FREE_ROOM_SOURCES.find((item) => item.id === sourceId);
  if (!source) throw new Error(`Unknown free-room source: ${sourceId}`);
  if (requested < 1 || requested > source.maxPartnerAccounts) {
    throw new Error(`${source.name} permits at most ${source.maxPartnerAccounts} configured integration(s) in this system.`);
  }
  return source;
}
