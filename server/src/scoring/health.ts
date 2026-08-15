import type {
  AccessibilityFinding,
  ConsoleEvent,
  DeduplicatedIssue,
  HealthScoreBreakdown,
  IssueSeverity,
  NetworkFailure,
  PerformanceMetrics,
  RuntimeErrorEvent,
  SecurityFinding,
  SeoFinding,
} from '../../../src/server/types/scan-types.ts';

/** Configurable console-noise weights. */
export const CONSOLE_WEIGHTS = {
  error: 8,
  warn: 3,
  excessLogAfter: 20,
  excessLog: 0.5,
  duplicateGroup: 1,
};

/**
 * consoleScore = 100 - errors*errorWeight - warnings*warnWeight
 *   - max(0, logs - excessLogAfter)*excessLog - duplicateGroups*duplicateGroup
 * Clamped to [0, 100].
 */
export function consoleNoiseScore(events: ConsoleEvent[]): { score: number; explanation: string[] } {
  const errors = events.filter((e) => e.type === 'error').length;
  const warns = events.filter((e) => e.type === 'warn').length;
  const logs = events.filter((e) => e.type === 'log' || e.type === 'info' || e.type === 'debug').length;
  const groups = new Map<string, number>();
  for (const e of events) {
    const k = `${e.type}:${e.text}`;
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  const duplicateGroups = [...groups.values()].filter((n) => n > 1).length;
  const excess = Math.max(0, logs - CONSOLE_WEIGHTS.excessLogAfter);
  const excessPenalty = Math.min(20, excess * CONSOLE_WEIGHTS.excessLog);
  const dupPenalty = Math.min(15, duplicateGroups * CONSOLE_WEIGHTS.duplicateGroup);
  let score =
    100 -
    errors * CONSOLE_WEIGHTS.error -
    warns * CONSOLE_WEIGHTS.warn -
    excessPenalty -
    dupPenalty;
  score = clamp(Math.round(score));
  return {
    score,
    explanation: [
      `errors=${errors} * ${CONSOLE_WEIGHTS.error}`,
      `warnings=${warns} * ${CONSOLE_WEIGHTS.warn}`,
      `excessLogs=${excess} * ${CONSOLE_WEIGHTS.excessLog}`,
      `duplicateGroups=${duplicateGroups} * ${CONSOLE_WEIGHTS.duplicateGroup}`,
    ],
  };
}

export const CATEGORY_WEIGHTS = {
  runtime: 1.2,
  network: 1.1,
  console: 0.8,
  performance: 1.0,
  accessibility: 1.0,
  security: 1.1,
  seo: 0.6,
  assets: 0.8,
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function metricNumber(v: number | 'NOT AVAILABLE'): number | null {
  return typeof v === 'number' ? v : null;
}

export function performanceScore(m: PerformanceMetrics): { score: number; explanation: string[] } {
  const parts: number[] = [];
  const explanation: string[] = [];
  const lcp = metricNumber(m.lcp);
  if (lcp !== null) {
    const s = lcp <= 2500 ? 100 : lcp <= 4000 ? 70 : 40;
    parts.push(s);
    explanation.push(`LCP ${lcp}ms → ${s}`);
  }
  const fcp = metricNumber(m.fcp);
  if (fcp !== null) {
    const s = fcp <= 1800 ? 100 : fcp <= 3000 ? 70 : 40;
    parts.push(s);
    explanation.push(`FCP ${fcp}ms → ${s}`);
  }
  const cls = metricNumber(m.cls);
  if (cls !== null) {
    const s = cls <= 0.1 ? 100 : cls <= 0.25 ? 70 : 40;
    parts.push(s);
    explanation.push(`CLS ${cls} → ${s}`);
  }
  const ttfb = metricNumber(m.ttfb);
  if (ttfb !== null) {
    const s = ttfb <= 800 ? 100 : ttfb <= 1800 ? 70 : 40;
    parts.push(s);
    explanation.push(`TTFB ${ttfb}ms → ${s}`);
  }
  if (!parts.length) {
    return { score: 0, explanation: ['NOT AVAILABLE: no performance metrics observed'] };
  }
  const score = clamp(Math.round(parts.reduce((a, b) => a + b, 0) / parts.length));
  return { score, explanation };
}

export function runtimeScore(errors: RuntimeErrorEvent[]): { score: number; explanation: string[] } {
  const unique = new Set(errors.map((e) => e.message)).size;
  const extra = Math.max(0, errors.length - unique);
  const score = clamp(100 - unique * 15 - extra * 2);
  return { score, explanation: [`uniqueErrors=${unique}`, `extraOccurrences=${extra}`] };
}

export function networkScore(failures: NetworkFailure[]): { score: number; explanation: string[] } {
  const s5 = failures.filter((f) => f.status >= 500).length;
  const s4 = failures.filter((f) => f.status >= 400 && f.status < 500).length;
  const other = failures.filter((f) => f.status < 400).length;
  const score = clamp(100 - s5 * 10 - s4 * 4 - other * 8);
  return { score, explanation: [`5xx=${s5}`, `4xx=${s4}`, `otherFailures=${other}`] };
}

export function accessibilityScore(findings: AccessibilityFinding[]): { score: number; explanation: string[] } {
  const unique = new Map<string, AccessibilityFinding>();
  for (const f of findings) {
    const k = `${f.rule}|${f.impact}`;
    if (!unique.has(k)) unique.set(k, f);
  }
  const uniq = [...unique.values()];
  const c = uniq.filter((f) => f.impact === 'critical').length;
  const s = uniq.filter((f) => f.impact === 'serious').length;
  const m = uniq.filter((f) => f.impact === 'moderate').length;
  const n = uniq.filter((f) => f.impact === 'minor').length;
  const score = clamp(100 - c * 15 - s * 8 - m * 3 - n * 1);
  return {
    score,
    explanation: [
      `criticalRules=${c}`,
      `seriousRules=${s}`,
      `moderateRules=${m}`,
      `minorRules=${n}`,
      `nodesObserved=${findings.length}`,
    ],
  };
}

export function securityScore(findings: SecurityFinding[]): { score: number; explanation: string[] } {
  const fail = findings.filter((f) => f.status === 'FAIL').length;
  const warn = findings.filter((f) => f.status === 'WARNING').length;
  const score = clamp(100 - fail * 12 - warn * 5);
  return { score, explanation: [`FAIL=${fail}`, `WARNING=${warn}`] };
}

export function seoScore(findings: SeoFinding[]): { score: number; explanation: string[] } {
  const issues = findings.flatMap((f) => f.issues);
  const err = issues.filter((i) => i.severity === 'ERROR').length;
  const warn = issues.filter((i) => i.severity === 'WARNING').length;
  const score = clamp(100 - err * 8 - warn * 3);
  return { score, explanation: [`seoErrors=${err}`, `seoWarnings=${warn}`] };
}

export function assetsScore(brokenCount: number): { score: number; explanation: string[] } {
  const score = clamp(100 - brokenCount * 6);
  return { score, explanation: [`brokenAssets=${brokenCount}`] };
}

export function computeHealthScores(input: {
  consoleEvents: ConsoleEvent[];
  runtimeErrors: RuntimeErrorEvent[];
  networkFailures: NetworkFailure[];
  performance: PerformanceMetrics;
  accessibility: AccessibilityFinding[];
  securityFindings: SecurityFinding[];
  seoFindings: SeoFinding[];
  brokenAssets: number;
  unavailable?: Partial<Record<keyof typeof CATEGORY_WEIGHTS, string>>;
}): HealthScoreBreakdown {
  const explanations: Record<string, string[]> = {};
  const console = consoleNoiseScore(input.consoleEvents);
  const runtime = runtimeScore(input.runtimeErrors);
  const network = networkScore(input.networkFailures);
  const performance = performanceScore(input.performance);
  const accessibility = accessibilityScore(input.accessibility);
  const security = securityScore(input.securityFindings);
  const seo = seoScore(input.seoFindings);
  const assets = assetsScore(input.brokenAssets);

  const scores: Record<string, number> = {
    runtime: runtime.score,
    network: network.score,
    console: console.score,
    performance: input.unavailable?.performance ? 0 : performance.score,
    accessibility: input.unavailable?.accessibility ? 0 : accessibility.score,
    security: security.score,
    seo: seo.score,
    assets: assets.score,
  };
  explanations.runtime = runtime.explanation;
  explanations.network = network.explanation;
  explanations.console = console.explanation;
  explanations.performance = input.unavailable?.performance
    ? [`UNAVAILABLE: ${input.unavailable.performance}`]
    : performance.explanation;
  explanations.accessibility = input.unavailable?.accessibility
    ? [`UNAVAILABLE: ${input.unavailable.accessibility}`]
    : accessibility.explanation;
  explanations.security = security.explanation;
  explanations.seo = seo.explanation;
  explanations.assets = assets.explanation;

  let weightSum = 0;
  let valueSum = 0;
  for (const [k, w] of Object.entries(CATEGORY_WEIGHTS)) {
    if (input.unavailable?.[k as keyof typeof CATEGORY_WEIGHTS]) continue;
    if (k === 'performance' && performance.explanation[0]?.startsWith('NOT AVAILABLE')) continue;
    weightSum += w;
    valueSum += scores[k] * w;
  }
  const overall = weightSum > 0 ? clamp(Math.round(valueSum / weightSum)) : 0;
  explanations.overall = [
    `weighted average of available categories using weights ${JSON.stringify(CATEGORY_WEIGHTS)}`,
  ];

  return {
    overall,
    runtime: scores.runtime,
    network: scores.network,
    console: scores.console,
    performance: scores.performance,
    accessibility: scores.accessibility,
    security: scores.security,
    seo: scores.seo,
    assets: scores.assets,
    consoleNoiseScore: console.score,
    explanations,
  };
}

export function severityForIssue(type: string, status?: number): IssueSeverity {
  if (type === 'runtime_exception' || type === 'unhandled_rejection') return 'ERROR';
  if (type === 'network_5xx') return 'ERROR';
  if (type === 'network_4xx' && status === 404) return 'WARNING';
  if (type === 'broken_asset') return 'WARNING';
  if (type === 'console_error') return 'ERROR';
  if (type === 'console_warn') return 'WARNING';
  if (type === 'console_log') return 'INFO';
  if (type === 'accessibility_critical') return 'ERROR';
  if (type === 'accessibility') return 'WARNING';
  if (type === 'security_fail') return 'ERROR';
  if (type === 'security_warning') return 'WARNING';
  if (status && status >= 500) return 'ERROR';
  if (status && status >= 400) return 'WARNING';
  return 'INFO';
}

export function dedupeIssues(issues: DeduplicatedIssue[]): DeduplicatedIssue[] {
  const map = new Map<string, DeduplicatedIssue>();
  for (const issue of issues) {
    const key = `${issue.type}|${issue.title}|${issue.evidence.method ?? ''}|${issue.evidence.url ?? issue.evidence.page ?? ''}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...issue, pages: [...issue.pages], occurrences: issue.occurrences || 1 });
    } else {
      existing.occurrences += issue.occurrences || 1;
      for (const p of issue.pages) {
        if (!existing.pages.includes(p)) existing.pages.push(p);
      }
    }
  }
  return [...map.values()];
}
