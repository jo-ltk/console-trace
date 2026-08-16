import type {
  Finding,
  FindingCategory,
  FindingsSummary,
  SeverityCounts,
} from '../../../src/server/types/scan-types.ts';

const CATEGORIES: FindingCategory[] = [
  'console',
  'runtime',
  'network',
  'assets',
  'performance',
  'accessibility',
  'security',
  'seo',
];

function emptyCounts(): SeverityCounts {
  return { critical: 0, error: 0, warning: 0, info: 0 };
}

export function summarizeFindings(findings: Finding[]): FindingsSummary {
  const severity = emptyCounts();
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, emptyCounts()])) as Record<
    FindingCategory,
    SeverityCounts
  >;
  for (const f of findings) {
    bump(severity, f.severity);
    bump(byCategory[f.category], f.severity);
  }
  return { total: findings.length, severity, byCategory };
}

function bump(counts: SeverityCounts, severity: Finding['severity']): void {
  if (severity === 'CRITICAL') counts.critical += 1;
  else if (severity === 'ERROR') counts.error += 1;
  else if (severity === 'WARNING') counts.warning += 1;
  else counts.info += 1;
}
