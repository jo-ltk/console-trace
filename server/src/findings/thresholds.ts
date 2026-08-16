/**
 * Core Web Vitals thresholds (milliseconds except CLS).
 * Sources: web.dev CWV guidance used as static constants — not live-fetched.
 *
 * LCP: good ≤ 2500, needs improvement ≤ 4000, poor > 4000
 * FCP: good ≤ 1800, needs improvement ≤ 3000, poor > 3000
 * CLS: good ≤ 0.1, needs improvement ≤ 0.25, poor > 0.25
 * TTFB: good ≤ 800, needs improvement ≤ 1800, poor > 1800
 *
 * Unavailable metrics must not produce findings or score penalties.
 */
export const PERF_THRESHOLDS = {
  lcp: { good: 2500, needsImprovement: 4000, unit: 'ms' },
  fcp: { good: 1800, needsImprovement: 3000, unit: 'ms' },
  cls: { good: 0.1, needsImprovement: 0.25, unit: '' },
  ttfb: { good: 800, needsImprovement: 1800, unit: 'ms' },
} as const;

export type PerfMetricName = keyof typeof PERF_THRESHOLDS;
export type PerfRating = 'good' | 'needs_improvement' | 'poor';

export function ratePerfMetric(metric: PerfMetricName, value: number): PerfRating {
  const t = PERF_THRESHOLDS[metric];
  if (value <= t.good) return 'good';
  if (value <= t.needsImprovement) return 'needs_improvement';
  return 'poor';
}

/** Excess TARGET console.log/info/debug after this count becomes a single INFO finding. */
export const CONSOLE_EXCESS_LOG_AFTER = 20;
