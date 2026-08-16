import type { DeduplicatedIssue, Finding } from '../../../src/server/types/scan-types.ts';

const CATEGORY_MAP = {
  console: 'CONSOLE',
  runtime: 'RUNTIME',
  network: 'NETWORK',
  assets: 'ASSETS',
  performance: 'PERFORMANCE',
  accessibility: 'ACCESSIBILITY',
  security: 'SECURITY',
  seo: 'SEO',
} as const;

export function issuesFromFindings(findings: Finding[]): DeduplicatedIssue[] {
  return findings.map((f) => ({
    id: f.id,
    type: f.kind,
    category: CATEGORY_MAP[f.category],
    severity: f.severity,
    title: f.title,
    description: f.summary,
    occurrences: f.occurrences,
    pages: f.pages,
    evidence: {
      url: typeof f.evidence.url === 'string' ? f.evidence.url : f.location.url,
      page: f.location.pageUrl,
      status: typeof f.evidence.status === 'number' ? f.evidence.status : undefined,
      timestamp: f.firstObservedAt,
      source: f.location.source,
      line: f.location.line,
      column: f.location.column,
      method: typeof f.evidence.method === 'string' ? f.evidence.method : undefined,
      snippet: typeof f.evidence.html === 'string' ? f.evidence.html : f.evidenceText,
      helpUrl: typeof f.evidence.helpUrl === 'string' ? f.evidence.helpUrl : undefined,
    },
  }));
}
