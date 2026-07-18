/**
 * Three-room manual operating model.
 *
 * Exactly one room may be active at a time.
 *
 * Room 1: Signal Room
 *   - discovers signals only
 *   - every signal must preserve source links for human credibility review
 *   - job boards are treated as business-signal sources, never as job-search destinations
 *   - enterprise / big-company signals are rejected; target is SMEs only
 *
 * Room 2: Selection + Enrichment Room
 *   - operator manually selects which signals to enrich
 *   - enrichment starts only after explicit approval
 *
 * Room 3: Manual Signal Intake Room
 *   - operator manually enters a supported signal with credible source evidence
 *   - system then collects surrounding company / people / contact data
 */

export type RoomMode = 'signal_room' | 'selection_enrichment_room' | 'manual_signal_room';

export interface RoomPolicy {
  activeRoom: RoomMode;
  manualOnly: true;
  requireSignalLinks: true;
  rejectEnterpriseTargets: true;
  jobBoardsForSignalsOnly: true;
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
    | 'google_result'
    | 'manual_upload'
    | 'other';
  capturedAt?: string;
}

export interface SignalRoomEvent {
  id?: number;
  signalType: string;
  sourcePlatform: string;
  companyNameRaw: string;
  title: string;
  snippet?: string;
  region?: string;
  sourceLinks: SignalSourceLink[];
  fitsStrategy: boolean;
  smeFit: 'yes' | 'no' | 'unknown';
  status: 'new' | 'reviewed' | 'approved_for_enrichment' | 'rejected';
}

export interface ManualSignalSubmission {
  signalType: string;
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
    purpose: 'sell_agentic_systems_and_saas',
  };
}

export function assertSingleActiveRoom(activeRoom: RoomMode, requestedRoom: RoomMode) {
  if (activeRoom !== requestedRoom) {
    throw new Error(
      `Room ${requestedRoom} is silent because ${activeRoom} is currently active. Exactly one room may run at a time.`,
    );
  }
}

export function assertSupportedSignalLinks(links: SignalSourceLink[]) {
  if (!links.length) throw new Error('Each signal must include at least one source link.');
  for (const link of links) {
    if (!/^https?:\/\//i.test(link.url)) {
      throw new Error(`Invalid signal source URL: ${link.url}`);
    }
  }
}

export function assertJobBoardSignalOnly(context: { sourcePlatform: string; title: string; snippet?: string }) {
  const platform = context.sourcePlatform.toLowerCase();
  if (!['indeed', 'linkedin', 'wellfound', 'glassdoor', 'ycombinator', 'job_board'].some((x) => platform.includes(x))) {
    return;
  }
  const text = `${context.title} ${context.snippet ?? ''}`.toLowerCase();
  const forbidden = ['apply now', 'send cv', 'resume', 'job seeker', 'candidate portal'];
  if (forbidden.some((x) => text.includes(x))) {
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

export function rejectEnterpriseTarget(params: { companyName: string; employeeCount?: number | null; enterpriseKeywords?: string[] }) {
  const enterpriseWords = params.enterpriseKeywords ?? [
    'fortune 500',
    'enterprise',
    'multinational',
    'global bank',
    'global insurance',
  ];
  const lower = params.companyName.toLowerCase();
  if (enterpriseWords.some((x) => lower.includes(x))) {
    throw new Error('Enterprise targets are out of scope. The system is restricted to SMEs.');
  }
  if (typeof params.employeeCount === 'number' && params.employeeCount >= 5000) {
    throw new Error('Large enterprise detected by employee count. The system is restricted to SMEs.');
  }
}
