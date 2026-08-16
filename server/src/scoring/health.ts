import type {
  AccessibilityFinding,
  ConsoleEvent,
  DeduplicatedIssue,
  Finding,
  HealthScoreBreakdown,
  NetworkFailure,
  PerformanceMetrics,
  RuntimeErrorEvent,
  SecurityFinding,
  SeoFinding,
} from '../../../src/server/types/scan-types.ts';
import { isTargetConsoleEvent } from '../scanner/console-source.ts';
import { buildFindings } from '../findings/pipeline.ts';
import { CONSOLE_EXCESS_LOG_AFTER } from '../findings/thresholds.ts';
import { severityForIssue as severityForKindCompat } from '../findings/severity.ts';

/**
 * Finding-based penalties (per unique finding after dedupe):
 *   CRITICAL = 18
 *   ERROR    = 10
 *   WARNING  = 4
 *   INFO     = 0
 * Extra occurrences of the same finding add 0.5 each, capped at 8.
 *
 * Accessibility scoring uses unique rule+impact (not every element).
 * Performance scoring uses metric thresholds, not finding counts.
 * Unavailable metrics are skipped (not scored as 0).
 */
export const FINDING_PENALTIES = {
  CRITICAL: 18,
  ERROR: 10,
  WARNING: 4,
  INFO: 0,
} as const;

export const OCCURRENCE_PENALTY = 0.5;
export const OCCURRENCE_PENALTY_CAP = 8;

/** Configurable console-noise weights (legacy helper; console category uses findings). */
export const CONSOLE_WEIGHTS = {
  error: 8,
  warn: 3,
  excessLogAfter: CONSOLE_EXCESS_LOG_AFTER,
  excessLog: 0.5,
  duplicateGroup: 1,
};

/**
 * consoleScore = 100 - errors*errorWeight - warnings*warnWeight
 *   - max(0, logs - excessLogAfter)*excessLog - duplicateGroups*duplicateGroup
 * Clamped to [0, 100]. SCANNER/BROWSER events are excluded.
 */
export function consoleNoiseScore(events: ConsoleEvent[]): { score: number; explanation: string[] } {
  const target = events.filter((e) => isTargetConsoleEvent(e.source));
  const errors = target.filter((e) => e.type === 'error').length;
  const warns = target.filter((e) => e.type === 'warn').length;
  const logs = target.filter((e) => e.type === 'log' || e.type === 'info' || e.type === 'debug').length;
  const groups = new Map<string, number>();
  for (const e of target) {
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

export function penaltyForFinding(f: Finding): number {
  const base = FINDING_PENALTIES[f.severity];
  if (f.severity === 'INFO') return 0;
  const extra = Math.min(OCCURRENCE_PENALTY_CAP, Math.max(0, f.occurrences - 1) * OCCURRENCE_PENALTY);
  return base + extra;
}

export function scoreFindings(findings: Finding[]): { score: number; explanation: string[] } {
  const total = findings.reduce((sum, f) => sum + penaltyForFinding(f), 0);
  const bySev = { CRITICAL: 0, ERROR: 0, WARNING: 0, INFO: 0 };
  for (const f of findings) bySev[f.severity] += 1;
  return {
    score: clamp(Math.round(100 - total)),
    explanation: [
      `findings=${findings.length}`,
      `CRITICAL=${bySev.CRITICAL}*${FINDING_PENALTIES.CRITICAL}`,
      `ERROR=${bySev.ERROR}*${FINDING_PENALTIES.ERROR}`,
      `WARNING=${bySev.WARNING}*${FINDING_PENALTIES.WARNING}`,
      `INFO=${bySev.INFO}*${FINDING_PENALTIES.INFO} (no penalty)`,
    ],
  };
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

function uniqueA11yFindings(findings: Finding[]): Finding[] {
  const map = new Map<string, Finding>();
  for (const f of findings) {
    const rule = String(f.evidence.rule ?? f.kind);
    const k = `${rule}|${f.severity}`;
    if (!map.has(k)) map.set(k, f);
  }
  return [...map.values()];
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
  findings?: Finding[];
}): HealthScoreBreakdown {
  const findings =
    input.findings ??
    buildFindings({
      scanId: 'score',
      pages: [],
      consoleEvents: input.consoleEvents,
      runtimeErrors: input.runtimeErrors,
      networkFailures: input.networkFailures,
      brokenResources: [],
      brokenLinks: [],
      accessibility: input.accessibility,
      securityFindings: input.securityFindings,
      seoFindings: input.seoFindings,
      performance: input.performance,
    });

  const byCat = (c: Finding['category']) => findings.filter((f) => f.category === c);
  const runtime = scoreFindings(byCat('runtime'));
  const network = scoreFindings(byCat('network'));
  const console = scoreFindings(byCat('console'));
  const performance = performanceScore(input.performance);
  const accessibility = scoreFindings(uniqueA11yFindings(byCat('accessibility')));
  const security = scoreFindings(byCat('security'));
  const seo = scoreFindings(byCat('seo'));
  const assets = scoreFindings(byCat('assets'));

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
  const explanations: Record<string, string[]> = {
    runtime: runtime.explanation,
    network: network.explanation,
    console: console.explanation,
    performance: input.unavailable?.performance
      ? [`UNAVAILABLE: ${input.unavailable.performance}`]
      : performance.explanation,
    accessibility: input.unavailable?.accessibility
      ? [`UNAVAILABLE: ${input.unavailable.accessibility}`]
      : accessibility.explanation,
    security: security.explanation,
    seo: seo.explanation,
    assets: assets.explanation,
  };

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
    `formula: 100 - sum(finding penalties); CRITICAL=${FINDING_PENALTIES.CRITICAL} ERROR=${FINDING_PENALTIES.ERROR} WARNING=${FINDING_PENALTIES.WARNING} INFO=${FINDING_PENALTIES.INFO}`,
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

export function severityForIssue(type: string, status?: number) {
  return severityForKindCompat(type, status);
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
