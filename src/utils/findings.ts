import type { ClientFinding, FindingSeverity } from '../types/scan';

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  CRITICAL: 0,
  ERROR: 1,
  WARNING: 2,
  INFO: 3,
};

/** Findings shown on the primary report surface (excludes low-value INFO). */
export function primaryFindings(findings: ClientFinding[]): ClientFinding[] {
  return findings.filter((f) => f.severity !== 'INFO');
}

/** Highest-priority findings for the overview/home surface. */
export function topFindings(findings: ClientFinding[], limit = 5): ClientFinding[] {
  return [...findings]
    .filter((f) => f.severity !== 'INFO')
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
    .slice(0, limit);
}

export function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Needs attention';
  return 'Critical';
}

export function scoreColor(score: number): string {
  if (score >= 90) return '#2D6A4F';
  if (score >= 70) return '#BC6C25';
  return '#D62828';
}

export function primaryFindingCount(findings: ClientFinding[]): number {
  return primaryFindings(findings).length;
}
