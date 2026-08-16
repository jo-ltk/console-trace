import type { ScanResult as ClientScan, NetworkIssue, ClientFinding } from '../types/scan';

function metricToNumber(v: unknown, asSeconds = false): number {
  if (typeof v !== 'number') return 0;
  return asSeconds ? v / 1000 : v;
}

function metricLabel(v: unknown, unit: string): string {
  if (v === 'NOT AVAILABLE' || v === undefined || v === null) return 'NOT AVAILABLE';
  if (typeof v === 'number') return unit === 's' ? `${(v / 1000).toFixed(2)}${unit}` : `${v}${unit}`;
  return String(v);
}

export function toClientScan(raw: Record<string, unknown>): ClientScan {
  const scan = (raw.scan ?? raw) as Record<string, unknown>;
  const summary = (raw.summary ?? {}) as Record<string, number>;
  const scores = (raw.scores ?? {}) as Record<string, unknown>;
  const consoleEvents = (raw.consoleEvents ?? []) as Array<Record<string, unknown>>;
  const runtimeErrors = (raw.runtimeErrors ?? []) as Array<Record<string, unknown>>;
  const networkFailures = (raw.networkFailures ?? []) as Array<Record<string, unknown>>;
  const accessibility = (raw.accessibility ?? []) as Array<Record<string, unknown>>;
  const pages = (raw.pages ?? []) as Array<Record<string, unknown>>;
  const performance = (raw.performance ?? {}) as Record<string, unknown>;
  const rawFindings = (raw.findings ?? []) as Array<Record<string, unknown>>;
  const findingsSummary = (raw.findingsSummary ?? {}) as Record<string, unknown>;
  const status = String(scan.status ?? raw.status ?? 'completed');
  const explanations = (scores.explanations ?? {}) as Record<string, string[]>;

  return {
    id: String(scan.id ?? raw.scanId ?? ''),
    url: String(scan.url ?? ''),
    normalizedUrl: String(scan.normalizedUrl ?? scan.url ?? ''),
    status: mapStatus(status),
    startedAt: String(scan.startedAt ?? ''),
    completedAt: scan.completedAt ? String(scan.completedAt) : undefined,
    pagesScanned: Number(summary.pagesScanned ?? 0),
    totalPages: Number(summary.pagesDiscovered ?? 0),
    healthScore: Number(scores.overall ?? 0),
    scores: {
      overall: Number(scores.overall ?? 0),
      runtime: Number(scores.runtime ?? 0),
      network: Number(scores.network ?? 0),
      console: Number(scores.console ?? 0),
      performance: Number(scores.performance ?? 0),
      accessibility: Number(scores.accessibility ?? 0),
      security: Number(scores.security ?? 0),
      seo: Number(scores.seo ?? 0),
      assets: Number(scores.assets ?? 0),
      explanations,
    },
    findings: rawFindings.map(mapFinding),
    findingsSummary: {
      total: Number((findingsSummary as { total?: number }).total ?? rawFindings.length),
      severity: {
        critical: Number((findingsSummary as { severity?: { critical?: number } }).severity?.critical ?? 0),
        error: Number((findingsSummary as { severity?: { error?: number } }).severity?.error ?? 0),
        warning: Number((findingsSummary as { severity?: { warning?: number } }).severity?.warning ?? 0),
        info: Number((findingsSummary as { severity?: { info?: number } }).severity?.info ?? 0),
      },
    },
    summary: {
      consoleCount: Number(summary.consoleEvents ?? 0),
      runtimeCount: Number(summary.runtimeErrors ?? 0),
      networkCount: Number(summary.networkFailures ?? 0),
      assetsCount: Number(summary.brokenAssets ?? 0),
      performanceRating: String(scores.performance ?? 'NOT AVAILABLE'),
      accessibilityCount: Number(summary.accessibilityViolations ?? 0),
    },
    consoleObservations: consoleEvents.map((c) => ({
      id: String(c.id),
      type: mapConsole(String(c.type)),
      message: String(c.text ?? ''),
      pageUrl: String(c.pageUrl ?? ''),
      timestamp: String(c.timestamp ?? ''),
      source: c.sourceUrl ? String(c.sourceUrl) : undefined,
      origin: mapConsoleOrigin(c.source),
      line: typeof c.line === 'number' ? c.line : undefined,
      column: typeof c.column === 'number' ? c.column : undefined,
    })),
    runtimeIssues: runtimeErrors.map((e) => ({
      id: String(e.id),
      message: String(e.message ?? ''),
      pageUrl: String(e.pageUrl ?? ''),
      stack: e.stack ? String(e.stack) : undefined,
      timestamp: String(e.timestamp ?? ''),
      severity: 'critical' as const,
    })),
    networkIssues: networkFailures.map((n) => ({
      id: String(n.id),
      method: String(n.method ?? 'GET') as NetworkIssue['method'],
      url: String(n.url ?? ''),
      status: Number(n.status ?? 0),
      duration: Number(n.duration ?? 0),
      pageUrl: String(n.pageUrl ?? ''),
      type: 'failed' as const,
    })),
    performanceMetrics: {
      lcp: metricToNumber(performance.lcp, true),
      fcp: metricToNumber(performance.fcp, true),
      cls: metricToNumber(performance.cls),
      inp: metricToNumber(performance.inp),
      ttfb: metricToNumber(performance.ttfb),
    },
    performanceLabels: {
      lcp: metricLabel(performance.lcp, 's'),
      fcp: metricLabel(performance.fcp, 's'),
      cls: metricLabel(performance.cls, ''),
      inp: metricLabel(performance.inp, 'ms'),
      ttfb: metricLabel(performance.ttfb, 'ms'),
    },
    accessibilityIssues: accessibility.map((a) => ({
      id: String(a.id),
      impact: (a.impact as ClientScan['accessibilityIssues'][number]['impact']) || 'moderate',
      description: String(a.description ?? ''),
      selector: String(a.selector ?? ''),
      pageUrl: String(a.pageUrl ?? ''),
    })),
    pages: pages.map((p) => ({
      id: String(p.id),
      url: String(p.url ?? ''),
      title: String(p.title ?? ''),
      status: (p.status as ClientScan['pages'][number]['status']) || 'healthy',
      statusCode: typeof p.statusCode === 'number' ? p.statusCode : undefined,
      issuesCount: Number(p.issuesCount ?? 0),
      duration: Number(p.duration ?? 0),
    })),
    errorMessage: scan.statusReason ? String(scan.statusReason) : undefined,
  };
}

export function mapFinding(f: Record<string, unknown>): ClientFinding {
  const location = (f.location ?? {}) as Record<string, unknown>;
  const evidence = (f.evidence ?? {}) as Record<string, unknown>;
  return {
    id: String(f.id),
    category: (f.category as ClientFinding['category']) || 'console',
    severity: (f.severity as ClientFinding['severity']) || 'INFO',
    title: String(f.title ?? ''),
    summary: String(f.summary ?? ''),
    description: String(f.description ?? ''),
    evidenceText: String(f.evidenceText ?? ''),
    evidence,
    pageUrl: location.pageUrl ? String(location.pageUrl) : undefined,
    url: location.url ? String(location.url) : evidence.url ? String(evidence.url) : undefined,
    occurrences: Number(f.occurrences ?? 1),
    firstObservedAt: String(f.firstObservedAt ?? ''),
    recommendation: String(f.recommendation ?? ''),
    whyItMatters: String(f.whyItMatters ?? ''),
    confidence: String(f.confidence ?? 'HIGH'),
    pages: Array.isArray(f.pages) ? f.pages.map(String) : [],
  };
}

function mapStatus(s: string): ClientScan['status'] {
  if (s === 'queued') return 'queued';
  if (s === 'failed') return 'failed';
  if (s === 'cancelled') return 'cancelled';
  if (s === 'completed' || s === 'completed_with_warnings') return 'completed';
  return 'scanning';
}

function mapConsole(t: string): ClientScan['consoleObservations'][number]['type'] {
  if (t === 'error' || t === 'warn' || t === 'info' || t === 'log') return t;
  return 'log';
}

function mapConsoleOrigin(v: unknown): ClientScan['consoleObservations'][number]['origin'] {
  if (v === 'SCANNER' || v === 'BROWSER' || v === 'TARGET') return v;
  return 'TARGET';
}
