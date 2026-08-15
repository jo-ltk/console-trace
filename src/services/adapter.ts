import type { ScanResult as ClientScan, NetworkIssue } from '../types/scan';

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
  const scores = (raw.scores ?? {}) as Record<string, number>;
  const consoleEvents = (raw.consoleEvents ?? []) as Array<Record<string, unknown>>;
  const runtimeErrors = (raw.runtimeErrors ?? []) as Array<Record<string, unknown>>;
  const networkFailures = (raw.networkFailures ?? []) as Array<Record<string, unknown>>;
  const accessibility = (raw.accessibility ?? []) as Array<Record<string, unknown>>;
  const pages = (raw.pages ?? []) as Array<Record<string, unknown>>;
  const performance = (raw.performance ?? {}) as Record<string, unknown>;
  const status = String(scan.status ?? raw.status ?? 'completed');

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
      issuesCount: Number(p.issuesCount ?? 0),
      duration: Number(p.duration ?? 0),
    })),
    errorMessage: scan.statusReason ? String(scan.statusReason) : undefined,
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
