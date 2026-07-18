export type EvidenceTier = 'primary' | 'authoritative' | 'reputable' | 'unknown';

export interface EvidenceItem {
  sourceId: string;
  sourceUrl?: string;
  sourceDomain?: string;
  title?: string;
  text: string;
  publishedAt?: string;
  retrievedAt: string;
  tier: EvidenceTier;
  companyDomain?: string;
  structuredFacts?: Record<string, string | number | boolean | null>;
}

export interface VerificationResult {
  verified: boolean;
  confidence: number;
  reasons: string[];
  supportingEvidence: EvidenceItem[];
  conflicts: string[];
}

const TIER_WEIGHT: Record<EvidenceTier, number> = {
  primary: 1,
  authoritative: 0.9,
  reputable: 0.72,
  unknown: 0.35,
};

function independentKey(e: EvidenceItem) {
  return e.sourceDomain || e.sourceId;
}

function ageWeight(publishedAt?: string) {
  if (!publishedAt) return 0.65;
  const ageDays = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / 86_400_000);
  if (ageDays <= 7) return 1;
  if (ageDays <= 30) return 0.9;
  if (ageDays <= 90) return 0.72;
  if (ageDays <= 365) return 0.45;
  return 0.2;
}

export function verifyClaim(params: {
  evidence: EvidenceItem[];
  minimumConfidence: number;
  requirePrimaryOrTwoIndependent?: boolean;
  expectedCompanyDomain?: string;
}): VerificationResult {
  const reasons: string[] = [];
  const conflicts: string[] = [];
  const evidence = params.evidence.filter((x) => x.text.trim().length > 0);
  const independent = new Map<string, EvidenceItem>();
  for (const item of evidence) {
    const key = independentKey(item);
    const existing = independent.get(key);
    if (!existing || TIER_WEIGHT[item.tier] > TIER_WEIGHT[existing.tier]) independent.set(key, item);
  }

  const unique = [...independent.values()];
  const primary = unique.filter((x) => x.tier === 'primary');
  const weighted = unique.map((x) => TIER_WEIGHT[x.tier] * ageWeight(x.publishedAt));
  const support = weighted.reduce((a, b) => a + b, 0);
  const sourceConfidence = 1 - Math.exp(-support / 1.5);

  let domainConfidence = 1;
  if (params.expectedCompanyDomain) {
    const matching = unique.filter((x) => x.companyDomain === params.expectedCompanyDomain);
    domainConfidence = matching.length ? 1 : 0.65;
    if (!matching.length) reasons.push('no evidence explicitly matched the expected company domain');
  }

  const factValues = new Map<string, Set<string>>();
  for (const item of unique) {
    for (const [key, raw] of Object.entries(item.structuredFacts ?? {})) {
      if (raw === null || raw === undefined) continue;
      const values = factValues.get(key) ?? new Set<string>();
      values.add(String(raw).trim().toLowerCase());
      factValues.set(key, values);
    }
  }
  for (const [key, values] of factValues) {
    if (values.size > 1) conflicts.push(`${key} has conflicting values: ${[...values].join(' | ')}`);
  }

  const conflictPenalty = Math.min(0.45, conflicts.length * 0.12);
  const confidence = Math.max(0, Math.min(1, sourceConfidence * domainConfidence - conflictPenalty));
  const sourceRulePassed = primary.length > 0 || unique.length >= 2;

  if (primary.length) reasons.push('supported by a primary source');
  if (unique.length >= 2) reasons.push(`supported by ${unique.length} independent sources`);
  if (conflicts.length) reasons.push('conflicting facts require review');

  const verified = confidence >= params.minimumConfidence &&
    (!params.requirePrimaryOrTwoIndependent || sourceRulePassed) &&
    conflicts.length === 0;

  return { verified, confidence, reasons, supportingEvidence: unique, conflicts };
}

export function fieldProvenance<T>(value: T, evidence: EvidenceItem[], confidence: number) {
  return {
    value,
    confidence,
    verified: confidence >= 0.8,
    sources: evidence.map((x) => ({
      sourceId: x.sourceId,
      sourceUrl: x.sourceUrl,
      tier: x.tier,
      publishedAt: x.publishedAt,
      retrievedAt: x.retrievedAt,
    })),
  };
}
