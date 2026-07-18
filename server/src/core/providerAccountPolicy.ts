export type ProviderAccountMode =
  | 'category_b_single_bulk_account'
  | 'limited_credit_30_pool'
  | 'single_public_research'
  | 'manual_contributor_pool'
  | 'authorized_workspace_pool'
  | 'internal_singleton';

export type ProviderConnectionStatus = 'live' | 'standby' | 'disabled' | 'error';

export interface ProviderAccountPolicy {
  providerId: string;
  displayName: string;
  mode: ProviderAccountMode;
  maximumConnections: number;
  defaultLiveConnections: number;
  defaultStandbyConnections: number;
  requiresSingleAccountBulkPermission: boolean;
  sharedSystem: true;
  notes: string;
}

const validate = (policy: ProviderAccountPolicy): ProviderAccountPolicy => {
  if (policy.mode === 'category_b_single_bulk_account') {
    if (
      policy.maximumConnections !== 1 ||
      policy.defaultLiveConnections !== 1 ||
      policy.defaultStandbyConnections !== 0 ||
      !policy.requiresSingleAccountBulkPermission
    ) {
      throw new Error(`Invalid Category B policy for ${policy.providerId}.`);
    }
  }

  if (policy.mode === 'limited_credit_30_pool') {
    if (
      policy.maximumConnections !== 30 ||
      policy.defaultLiveConnections !== 15 ||
      policy.defaultStandbyConnections !== 15
    ) {
      throw new Error(`Invalid 30-account layout for ${policy.providerId}.`);
    }
  }

  if (policy.defaultLiveConnections + policy.defaultStandbyConnections > policy.maximumConnections) {
    throw new Error(`Connection defaults exceed the maximum for ${policy.providerId}.`);
  }

  return policy;
};

export const PROVIDER_ACCOUNT_POLICIES: ProviderAccountPolicy[] = [
  validate({
    providerId: 'apollo',
    displayName: 'Apollo',
    mode: 'limited_credit_30_pool',
    maximumConnections: 30,
    defaultLiveConnections: 15,
    defaultStandbyConnections: 15,
    requiresSingleAccountBulkPermission: false,
    sharedSystem: true,
    notes: 'Thirty individually owned connections managed in one application.',
  }),
  validate({
    providerId: 'hunter',
    displayName: 'Hunter',
    mode: 'limited_credit_30_pool',
    maximumConnections: 30,
    defaultLiveConnections: 15,
    defaultStandbyConnections: 15,
    requiresSingleAccountBulkPermission: false,
    sharedSystem: true,
    notes: 'Thirty individually owned connections managed in one application.',
  }),
];

export function providerPolicy(providerId: string): ProviderAccountPolicy {
  const policy = PROVIDER_ACCOUNT_POLICIES.find((item) => item.providerId === providerId);
  if (!policy) throw new Error(`Unknown provider account policy: ${providerId}`);
  return policy;
}

export function validateConnectionLayout(
  providerId: string,
  liveConnections: number,
  standbyConnections: number,
): ProviderAccountPolicy {
  const policy = providerPolicy(providerId);
  if (!Number.isInteger(liveConnections) || !Number.isInteger(standbyConnections)) {
    throw new Error('Connection counts must be integers.');
  }
  if (liveConnections < 0 || standbyConnections < 0) {
    throw new Error('Connection counts cannot be negative.');
  }
  if (liveConnections + standbyConnections > policy.maximumConnections) {
    throw new Error(`${policy.displayName} permits at most ${policy.maximumConnections} configured connections.`);
  }
  if (policy.mode === 'category_b_single_bulk_account' && (liveConnections !== 1 || standbyConnections !== 0)) {
    throw new Error(`${policy.displayName} is Category B and must use exactly one live integration.`);
  }
  return policy;
}
