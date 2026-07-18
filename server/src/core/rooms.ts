/**
 * Five-room manual operating model.
 *
 * Exactly one room may be active at a time. All rooms are manually triggered.
 *
 * Room 1: Signal Discovery
 *   - discovers broad, open-world lead-convertible business signals
 *   - every signal preserves source links for human credibility review
 *   - job boards are business-signal sources, never job-search destinations
 *   - enterprise / big-company signals are rejected; target is SMEs only
 *
 * Room 2: Selection + Enrichment
 *   - operator manually selects which discovered signals to enrich
 *   - enrichment starts only after explicit approval
 *
 * Room 3: Agency Referrals
 *   - finds SME agency partnership, overflow, white-label and referral signals
 *   - uses only free or genuine free-tier sources configured in freeRoomSources.ts
 *
 * Room 4: Community Monitoring
 *   - monitors approved Facebook, X, Reddit, Discord and Slack contexts for signals
 *   - access must be authorized and platform rules must be respected
 *
 * Room 5: Manual Signal Intake
 *   - operator manually enters a supported signal with credible source evidence
 *   - system then collects surrounding company / people / contact data
 */

export type RoomMode =
  | 'signal_room'
  | 'selection_enrichment_room'
  | 'referrals_room'
  | 'community_monitoring_room'
  | 'manual_signal_room';

export type RoomState = RoomMode | 'idle';

export const ROOM_LABELS: Record<RoomMode, string> = {
  signal_room: 'Room 1 — Signal Discovery',
  selection_enrichment_room: 'Room 2 — Selection + Enrichment',
  referrals_room: 'Room 3 — Agency Referrals',
  community_monitoring_room: 'Room 4 — Community Monitoring',
  manual_signal_room: 'Room 5 — Manual Signal Intake',
};

export interface RoomPolicy {
  activeRoom: RoomMode;
  manualOnly: true;
  requireSignalLinks: true;
  rejectEnterpriseTargets: true;
  jobBoardsForSignalsOnly: true;
  openWorldSignalDetection: true;
  purpose: 'sell_agentic_systems_and_saas';
}

export interface SignalSourceLink {
  label: string;
  url: string;
  sourceType:
    | 'official_company'
    | 'job_board'
    | 'review_site'
    | 'news'
    | 'public_record'
    | 'directory'
    | 'social'
    | 'community'
    | 'google_result'
    | 'manual_upload'
    | 'other';
  capturedAt?: string;
}

export interface SignalRoomEvent {
  id?: number;
  signalType?: string;
  signalHypotheses?: string[];
  sourcePlatform: string;
  companyNameRaw: string;
  title: string;
  snippet?: string;
  region?: string;
  rationale?: string;
  sourceLinks: SignalSourceLink[];
  fitsStrategy: boolean;
  smeFit: 'yes' | 'no' | 'unknown';
  status: 'candidate' | 'reviewed' | 'selected_for_enrichment' | 'rejected' | 'enrichment_in_progress' | 'enriched';
}

export interface ManualSignalSubmission {
  signalType?: string;
  signalHypotheses?: string[];
  companyNameRaw: string;
  title: string;
  description: string;
  sourceLinks: SignalSourceLink[];
  submittedBy: string;
}

export function defaultRoomPolicy(activeRoom: RoomMode): RoomPolicy {
  return {
    activeRoom,
    manualOnly: true,
    requireSignalLinks: true,
    rejectEnterpriseTargets: true,
    jobBoardsForSignalsOnly: true,
    openWorldSignalDetection: true,
    purpose: 'sell_agentic_systems_and_saas',
  };
}

export function assertSingleActiveRoom(activeRoom: RoomState, requestedRoom: RoomMode) {
  if (activeRoom !== requestedRoom) {
    throw new Error(
      `Room ${requestedRoom} is silent because ${activeRoom} is currently active. Exactly one room may run at a time.`,
    );
  }
}

export function assertSupportedSignalLinks(links: SignalSourceLink[]) {
  if (!Array.isArray(links) || !links.length) throw new Error('Each signal must include at least one source link.');
  for (const link of links) {
    if (!link?.label?.trim()) throw new Error('Every signal source link needs a label.');
    if (!/^https?:\/\//i.test(link.url)) throw new Error(`Invalid signal source URL: ${link.url}`);
  }
}

export function assertJobBoardSignalOnly(context: { sourcePlatform: string; title: string; snippet?: string }) {
  const platform = context.sourcePlatform.toLowerCase();
  if (!['indeed', 'linkedin', 'wellfound', 'glassdoor', 'ycombinator', 'upwork', 'job_board'].some((x) => platform.includes(x))) {
    return;
  }
  const text = `${context.title} ${context.snippet ?? ''}`.toLowerCase();
  const jobSeekingIntent = ['help me apply', 'write my cv', 'resume for this job', 'job seeker workflow', 'submit application'];
  if (jobSeekingIntent.some((x) => text.includes(x))) {
    throw new Error('Job-board data must be used only as a business signal, not as a job-search workflow.');
  }
}

export function inferSmeFit(params: {
  employeeCount?: number | null;
  revenueUsd?: number | null;
  strategyMinEmployees?: number | null;
  strategyMaxEmployees?: number | null;
  strategyMinRevenueUsd?: number | null;
  strategyMaxRevenueUsd?: number | null;
}): 'yes' | 'no' | 'unknown' {
  const employeeKnown = typeof params.employeeCount === 'number';
  const revenueKnown = typeof params.revenueUsd === 'number';
  const employeeOk = !employeeKnown
    ? null
    : (params.strategyMinEmployees == null || params.employeeCount! >= params.strategyMinEmployees) &&
      (params.strategyMaxEmployees == null || params.employeeCount! <= params.strategyMaxEmployees);
  const revenueOk = !revenueKnown
    ? null
    : (params.strategyMinRevenueUsd == null || params.revenueUsd! >= params.strategyMinRevenueUsd) &&
      (params.strategyMaxRevenueUsd == null || params.revenueUsd! <= params.strategyMaxRevenueUsd);
  if (employeeOk === false || revenueOk === false) return 'no';
  if (employeeOk === true || revenueOk === true) return 'yes';
  return 'unknown';
}

export function rejectEnterpriseTarget(params: {
  companyName: string;
  employeeCount?: number | null;
  maxEmployees?: number | null;
  enterpriseKeywords?: string[];
}) {
  const enterpriseWords = params.enterpriseKeywords ?? [
    'fortune 500', 'fortune 1000', 'multinational conglomerate', 'global bank', 'global insurance group',
  ];
  const lower = params.companyName.toLowerCase();
  if (enterpriseWords.some((x) => lower.includes(x))) {
    throw new Error('Enterprise targets are out of scope. The system is restricted to SMEs.');
  }
  const maximum = params.maxEmployees ?? 500;
  if (typeof params.employeeCount === 'number' && params.employeeCount > maximum) {
    throw new Error(`Company exceeds the configured SME maximum of ${maximum} employees.`);
  }
}
