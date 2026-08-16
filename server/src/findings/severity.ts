import type { IssueSeverity } from '../../../src/server/types/scan-types.ts';

/**
 * Central severity rules. Do not assign severity ad hoc in classifiers.
 *
 * CRITICAL — uncaught page crashes, axe critical, browser crash
 * ERROR    — console.error, 5xx, unhandled rejection, axe serious, security FAIL
 * WARNING  — console.warn, 4xx, broken assets/links, axe moderate, missing security headers
 * INFO     — excess logs, axe minor, SEO/security informational observations
 */
export const SEVERITY_RULES = {
  console_error: 'ERROR',
  console_warn: 'WARNING',
  console_excess_log: 'INFO',
  runtime_pageerror: 'CRITICAL',
  runtime_uncaught_exception: 'CRITICAL',
  runtime_unhandled_rejection: 'ERROR',
  runtime_browser_crash: 'CRITICAL',
  runtime_execution_failure: 'ERROR',
  network_5xx: 'ERROR',
  network_403: 'WARNING',
  network_404: 'WARNING',
  network_4xx: 'WARNING',
  network_timeout: 'ERROR',
  network_dns: 'ERROR',
  network_cors: 'ERROR',
  network_failed: 'ERROR',
  asset_broken: 'WARNING',
  broken_link: 'WARNING',
  a11y_critical: 'CRITICAL',
  a11y_serious: 'ERROR',
  a11y_moderate: 'WARNING',
  a11y_minor: 'INFO',
  perf_needs_improvement: 'INFO',
  perf_poor: 'WARNING',
  security_fail: 'ERROR',
  security_warning: 'WARNING',
  security_info: 'INFO',
  seo_error: 'ERROR',
  seo_warning: 'WARNING',
  seo_info: 'INFO',
} as const satisfies Record<string, IssueSeverity>;

export type SeverityKind = keyof typeof SEVERITY_RULES;

export function severityForKind(kind: SeverityKind): IssueSeverity {
  return SEVERITY_RULES[kind];
}

export function axeImpactToKind(
  impact: 'critical' | 'serious' | 'moderate' | 'minor',
): Extract<SeverityKind, 'a11y_critical' | 'a11y_serious' | 'a11y_moderate' | 'a11y_minor'> {
  if (impact === 'critical') return 'a11y_critical';
  if (impact === 'serious') return 'a11y_serious';
  if (impact === 'moderate') return 'a11y_moderate';
  return 'a11y_minor';
}

export function networkKindForFailure(input: {
  status: number;
  reason: string;
}): Extract<
  SeverityKind,
  'network_5xx' | 'network_403' | 'network_404' | 'network_4xx' | 'network_timeout' | 'network_dns' | 'network_cors' | 'network_failed'
> {
  const reason = input.reason.toLowerCase();
  if (reason.includes('cors') || (reason.includes('err_failed') && reason.includes('access-control'))) {
    return 'network_cors';
  }
  if (reason.includes('timed_out') || reason.includes('timeout') || reason.includes('err_timed_out')) return 'network_timeout';
  if (reason.includes('name_not_resolved') || reason.includes('dns') || reason.includes('err_name_not_resolved')) return 'network_dns';
  if (input.status >= 500) return 'network_5xx';
  if (input.status === 403) return 'network_403';
  if (input.status === 404 || input.status === 410) return 'network_404';
  if (input.status >= 400) return 'network_4xx';
  return 'network_failed';
}

/** Back-compat wrapper used by older issue builders and unit tests. */
export function severityForIssue(type: string, status?: number): IssueSeverity {
  if (type === 'unhandled_rejection') return SEVERITY_RULES.runtime_unhandled_rejection;
  if (type === 'runtime_exception') return SEVERITY_RULES.runtime_pageerror;
  if (type === 'network_5xx') return SEVERITY_RULES.network_5xx;
  if (type === 'network_4xx' && status === 404) return SEVERITY_RULES.network_404;
  if (type === 'broken_asset') return SEVERITY_RULES.asset_broken;
  if (type === 'console_error') return SEVERITY_RULES.console_error;
  if (type === 'console_warn') return SEVERITY_RULES.console_warn;
  if (type === 'console_log') return SEVERITY_RULES.console_excess_log;
  if (type === 'accessibility_critical') return SEVERITY_RULES.a11y_critical;
  if (type === 'accessibility') return SEVERITY_RULES.a11y_moderate;
  if (type === 'security_fail') return SEVERITY_RULES.security_fail;
  if (type === 'security_warning') return SEVERITY_RULES.security_warning;
  if (status && status >= 500) return SEVERITY_RULES.network_5xx;
  if (status && status >= 400) return SEVERITY_RULES.network_4xx;
  return 'INFO';
}
