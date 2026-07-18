export type BusinessSize = 'micro' | 'small' | 'medium' | 'enterprise';

export interface TargetingStrategy {
  id: string;
  name: string;
  product: {
    name: string;
    description: string;
    painsSolved: string[];
    useCases: string[];
    excludedUseCases: string[];
  };
  market: {
    countries: string[];
    regions: string[];
    industries: string[];
    businessSizes: BusinessSize[];
    employeeMin?: number;
    employeeMax?: number;
    revenueMinUsd?: number;
    revenueMaxUsd?: number;
    businessModels: string[];
    requiredTechnologies: string[];
    excludedIndustries: string[];
  };
  personas: {
    targetTitles: string[];
    targetDepartments: string[];
    excludedTitles: string[];
  };
  signals: {
    includedCodes: string[];
    excludedCodes: string[];
    keywords: string[];
    negativeKeywords: string[];
    maxAgeDays: number;
    minimumConfidence: number;
    minimumRelevance: number;
  };
  execution: {
    sourceIds: string[];
    maxEventsPerRun: number;
    maxCompaniesPerRun: number;
    maxContactsPerCompany: number;
    requireVerifiedCompany: boolean;
    requireVerifiedContact: boolean;
  };
}

export interface CandidateEvent {
  title: string;
  body: string;
  sourceId: string;
  sourceUrl?: string;
  publishedAt?: string;
  companyName?: string;
  country?: string;
  industry?: string;
  employeeCount?: number;
  signalCode?: string;
}

const text = (event: CandidateEvent) => `${event.title} ${event.body}`.toLowerCase();

export function validateStrategy(strategy: TargetingStrategy): string[] {
  const errors: string[] = [];
  if (!strategy.product?.name?.trim()) errors.push('product.name is required');
  if (!strategy.product?.painsSolved?.length) errors.push('at least one product pain is required');
  if (!strategy.market?.countries?.length && !strategy.market?.regions?.length)
    errors.push('at least one country or region is required');
  if (!strategy.market?.industries?.length) errors.push('at least one target industry is required');
  if (!strategy.personas?.targetTitles?.length) errors.push('at least one target title is required');
  if (!strategy.signals?.includedCodes?.length && !strategy.signals?.keywords?.length)
    errors.push('at least one signal code or keyword is required');
  if (strategy.signals.minimumConfidence < 0 || strategy.signals.minimumConfidence > 1)
    errors.push('minimumConfidence must be between 0 and 1');
  if (strategy.signals.minimumRelevance < 0 || strategy.signals.minimumRelevance > 1)
    errors.push('minimumRelevance must be between 0 and 1');
  if (strategy.execution.maxEventsPerRun < 1) errors.push('maxEventsPerRun must be positive');
  if (strategy.execution.maxCompaniesPerRun < 1) errors.push('maxCompaniesPerRun must be positive');
  return errors;
}

export function strategyAllowsEvent(strategy: TargetingStrategy, event: CandidateEvent): {
  allowed: boolean;
  relevance: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 0;
  let possible = 0;
  const haystack = text(event);

  possible += 3;
  if (!strategy.execution.sourceIds.length || strategy.execution.sourceIds.includes(event.sourceId)) {
    score += 3;
    reasons.push('approved source');
  } else reasons.push('source not approved');

  possible += 4;
  const positiveKeywords = [...strategy.signals.keywords, ...strategy.product.painsSolved, ...strategy.product.useCases]
    .map((x) => x.toLowerCase());
  const positiveHits = positiveKeywords.filter((x) => haystack.includes(x));
  if (positiveHits.length) {
    score += Math.min(4, 1 + positiveHits.length);
    reasons.push(`matched context: ${positiveHits.slice(0, 4).join(', ')}`);
  }

  possible += 3;
  if (event.signalCode && strategy.signals.includedCodes.includes(event.signalCode)) {
    score += 3;
    reasons.push(`approved signal ${event.signalCode}`);
  } else if (!event.signalCode && positiveHits.length) {
    score += 1;
    reasons.push('candidate signal inferred from strategy keywords');
  }

  possible += 3;
  if (!event.country || strategy.market.countries.some((x) => x.toLowerCase() === event.country!.toLowerCase())) {
    score += 3;
    reasons.push('geography matched or pending verification');
  } else reasons.push('geography mismatch');

  possible += 3;
  if (!event.industry || strategy.market.industries.some((x) => x.toLowerCase() === event.industry!.toLowerCase())) {
    score += 3;
    reasons.push('industry matched or pending verification');
  } else reasons.push('industry mismatch');

  possible += 2;
  const min = strategy.market.employeeMin ?? 0;
  const max = strategy.market.employeeMax ?? Number.MAX_SAFE_INTEGER;
  if (!event.employeeCount || (event.employeeCount >= min && event.employeeCount <= max)) {
    score += 2;
    reasons.push('SME size matched or pending verification');
  } else reasons.push('company size outside target range');

  const negatives = [...strategy.signals.negativeKeywords, ...strategy.product.excludedUseCases, ...strategy.market.excludedIndustries]
    .map((x) => x.toLowerCase())
    .filter((x) => x && haystack.includes(x));
  if (negatives.length) {
    reasons.push(`excluded context: ${negatives.join(', ')}`);
    return { allowed: false, relevance: 0, reasons };
  }
  if (event.signalCode && strategy.signals.excludedCodes.includes(event.signalCode)) {
    reasons.push(`excluded signal ${event.signalCode}`);
    return { allowed: false, relevance: 0, reasons };
  }

  const relevance = possible ? score / possible : 0;
  return { allowed: relevance >= strategy.signals.minimumRelevance, relevance, reasons };
}
