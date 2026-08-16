import { randomUUID } from 'node:crypto';
import type {
  AccessibilityFinding,
  BrokenLink,
  BrokenResource,
  ConsoleEvent,
  Finding,
  FindingCategory,
  FindingConfidence,
  FindingEvidence,
  FindingLocation,
  NetworkFailure,
  PerformanceMetrics,
  ResourceType,
  RuntimeErrorEvent,
  ScannedPageResult,
  SecurityFinding,
  SeoFinding,
} from '../../../src/server/types/scan-types.ts';
import { isTargetConsoleEvent } from '../scanner/console-source.ts';
import { evidenceTextFrom, redactEvidence } from './evidence.ts';
import { hashKey, normalizeFindingUrl, normalizeMessage, pathOf } from './keys.ts';
import { recommendationFor, whyItMatters } from './recommendations.ts';
import {
  axeImpactToKind,
  networkKindForFailure,
  severityForKind,
  type SeverityKind,
} from './severity.ts';
import { CONSOLE_EXCESS_LOG_AFTER, ratePerfMetric, type PerfMetricName } from './thresholds.ts';

const ASSET_TYPES = new Set<ResourceType>(['image', 'script', 'stylesheet', 'font', 'media']);

export interface FindingsInput {
  scanId: string;
  pages: ScannedPageResult[];
  consoleEvents: ConsoleEvent[];
  runtimeErrors: RuntimeErrorEvent[];
  networkFailures: NetworkFailure[];
  brokenResources: BrokenResource[];
  brokenLinks: BrokenLink[];
  accessibility: AccessibilityFinding[];
  securityFindings: SecurityFinding[];
  seoFindings: SeoFinding[];
  performance: PerformanceMetrics;
}

interface Candidate {
  kind: SeverityKind;
  category: FindingCategory;
  title: string;
  summary: string;
  description: string;
  evidence: FindingEvidence;
  location: FindingLocation;
  pageUrl: string;
  observedAt: string;
  source: string;
  confidence: FindingConfidence;
  recContext: Record<string, unknown>;
  dedupeKey: string;
}

export function buildFindings(input: FindingsInput): Finding[] {
  const candidates: Candidate[] = [
    ...fromConsole(input.consoleEvents),
    ...fromRuntime(input.runtimeErrors),
    ...fromNetwork(input.networkFailures, input.pages),
    ...fromAssets(input.brokenResources),
    ...fromBrokenLinks(input.brokenLinks, input.pages),
    ...fromAccessibility(input.accessibility),
    ...fromPerformance(input.performance),
    ...fromSecurity(input.securityFindings, input.pages),
    ...fromSeo(input.seoFindings),
  ];
  return dedupeAndFinalize(input.scanId, input.pages, candidates);
}

function fromConsole(events: ConsoleEvent[]): Candidate[] {
  const target = events.filter((e) => isTargetConsoleEvent(e.source));
  const out: Candidate[] = [];
  for (const e of target) {
    if (e.type === 'error' || e.type === 'warn') {
      const kind = e.type === 'error' ? 'console_error' : 'console_warn';
      const text = normalizeMessage(e.text);
      out.push({
        kind,
        category: 'console',
        title: `TARGET console.${e.type}`,
        summary: text.slice(0, 200),
        description: `RUNTIME OBSERVED console.${e.type}: ${text}`,
        evidence: {
          type: 'console',
          consoleType: e.type,
          message: text,
          pageUrl: e.pageUrl,
          sourceUrl: e.sourceUrl,
          line: e.line,
          column: e.column,
          observedAt: e.timestamp,
        },
        location: { pageUrl: e.pageUrl, source: e.sourceUrl, line: e.line, column: e.column },
        pageUrl: e.pageUrl,
        observedAt: e.timestamp,
        source: 'TARGET',
        confidence: e.type === 'error' ? 'HIGH' : 'HIGH',
        recContext: {},
        dedupeKey: `console|${e.type}|${text}`,
      });
    }
  }
  const logs = target.filter((e) => e.type === 'log' || e.type === 'info' || e.type === 'debug');
  if (logs.length > CONSOLE_EXCESS_LOG_AFTER) {
    const first = logs[0];
    out.push({
      kind: 'console_excess_log',
      category: 'console',
      title: 'Excessive TARGET console.log/debug output',
      summary: `${logs.length} log/info/debug messages observed (threshold ${CONSOLE_EXCESS_LOG_AFTER})`,
      description: `${logs.length} TARGET console.log/info/debug events exceeded the documented threshold of ${CONSOLE_EXCESS_LOG_AFTER}.`,
      evidence: {
        type: 'console',
        consoleType: 'log',
        count: logs.length,
        threshold: CONSOLE_EXCESS_LOG_AFTER,
        pageUrl: first.pageUrl,
        observedAt: first.timestamp,
      },
      location: { pageUrl: first.pageUrl },
      pageUrl: first.pageUrl,
      observedAt: first.timestamp,
      source: 'TARGET',
      confidence: 'HIGH',
      recContext: {},
      dedupeKey: 'console|excess_log',
    });
  }
  return out;
}

function fromRuntime(errors: RuntimeErrorEvent[]): Candidate[] {
  return errors.map((e) => {
    const kind: SeverityKind =
      e.type === 'unhandled_rejection'
        ? 'runtime_unhandled_rejection'
        : e.type === 'browser_crash'
          ? 'runtime_browser_crash'
          : e.type === 'execution_failure'
            ? 'runtime_execution_failure'
            : e.type === 'uncaught_exception'
              ? 'runtime_uncaught_exception'
              : 'runtime_pageerror';
    const hasSource = Boolean(e.sourceUrl) && e.line !== undefined;
    const locationLabel = hasSource
      ? `${e.sourceUrl}:${e.line}:${e.column ?? 0}`
      : 'Source location unavailable';
    const title =
      e.type === 'unhandled_rejection' ? 'Unhandled promise rejection' : 'Unhandled JavaScript exception';
    return {
      kind,
      category: 'runtime' as const,
      title,
      summary: normalizeMessage(e.message).slice(0, 200),
      description: e.stack ? redactable(e.stack) : `${normalizeMessage(e.message)} (${locationLabel})`,
      evidence: {
        type: 'runtime',
        runtimeType: e.type,
        message: normalizeMessage(e.message),
        stack: e.stack ? redactable(e.stack) : undefined,
        url: e.pageUrl,
        source: hasSource ? e.sourceUrl : 'Source location unavailable',
        line: hasSource ? e.line : undefined,
        column: hasSource ? e.column : undefined,
        observedAt: e.timestamp,
      },
      location: {
        pageUrl: e.pageUrl,
        source: hasSource ? e.sourceUrl : undefined,
        line: hasSource ? e.line : undefined,
        column: hasSource ? e.column : undefined,
      },
      pageUrl: e.pageUrl,
      observedAt: e.timestamp,
      source: 'OBSERVED',
      confidence: 'HIGH' as const,
      recContext: {},
      dedupeKey: `runtime|${hashKey([e.message, e.sourceUrl, e.line, e.column])}`,
    };
  });
}

function fromNetwork(failures: NetworkFailure[], pages: ScannedPageResult[]): Candidate[] {
  const pageUrls = new Set(pages.map((p) => p.url));
  const out: Candidate[] = [];
  for (const e of failures) {
    if (ASSET_TYPES.has(e.resourceType)) continue;
    const isCrawledDoc =
      e.resourceType === 'document' && pageUrls.has(e.url) && (e.status === 404 || e.status === 410 || e.status >= 500 || e.status === 0);
    if (isCrawledDoc) continue;

    const kind = networkKindForFailure({ status: e.status, reason: e.reason });
    const urlPath = pathOf(e.url);
    const isApi = e.resourceType === 'xhr' || e.resourceType === 'fetch' || e.resourceType === 'websocket';
    const title = networkTitle(kind, isApi, e.status);
    out.push({
      kind,
      category: 'network',
      title,
      summary: `${e.method} ${urlPath}${e.status ? ` HTTP ${e.status}` : ''}`.trim(),
      description: e.reason,
      evidence: {
        type: 'network',
        method: e.method,
        url: normalizeFindingUrl(e.url),
        status: e.status,
        pageUrl: e.pageUrl,
        durationMs: e.duration,
        resourceType: e.resourceType,
        reason: e.reason,
        observedAt: undefined,
      },
      location: { pageUrl: e.pageUrl, url: normalizeFindingUrl(e.url) },
      pageUrl: e.pageUrl,
      observedAt: new Date().toISOString(),
      source: 'OBSERVED',
      confidence: e.status >= 400 ? 'HIGH' : 'HIGH',
      recContext: { status: e.status },
      dedupeKey: `network|${e.method}|${normalizeFindingUrl(e.url)}|${e.status}`,
    });
  }
  return out;
}

function networkTitle(kind: SeverityKind, isApi: boolean, status: number): string {
  if (kind === 'network_timeout') return 'Request timed out';
  if (kind === 'network_dns') return 'Network request failed';
  if (kind === 'network_cors') return 'Network request failed';
  if (kind === 'network_failed') return 'Network request failed';
  if (status === 500 && isApi) return 'API request returned 500';
  if (status >= 500 && isApi) return `API request returned ${status}`;
  if (status >= 500) return `Request returned ${status}`;
  if (status === 404) return 'Resource returned 404';
  if (status === 403) return 'Request returned 403';
  if (isApi && status >= 400) return 'API request failed';
  if (status >= 400) return `Resource returned ${status}`;
  return 'Network request failed';
}

function fromAssets(resources: BrokenResource[]): Candidate[] {
  return resources
    .filter((b) => ASSET_TYPES.has(b.resourceType))
    .map((b) => {
      const label = assetLabel(b.resourceType);
      return {
        kind: 'asset_broken' as const,
        category: 'assets' as const,
        title: `Broken ${label} resource`,
        summary: `${pathOf(b.url)}${b.status ? ` HTTP ${b.status}` : ''}`.trim(),
        description: b.error ?? `Broken ${b.resourceType}`,
        evidence: {
          type: 'asset',
          url: normalizeFindingUrl(b.url),
          resourceType: b.resourceType,
          status: b.status,
          pageUrl: b.pageUrl,
          error: b.error,
        },
        location: { pageUrl: b.pageUrl, url: normalizeFindingUrl(b.url) },
        pageUrl: b.pageUrl,
        observedAt: new Date().toISOString(),
        source: 'OBSERVED',
        confidence: 'HIGH' as const,
        recContext: { resourceType: b.resourceType },
        dedupeKey: `asset|${normalizeFindingUrl(b.url)}|${b.status}`,
      };
    });
}

function assetLabel(t: ResourceType): string {
  if (t === 'image') return 'image';
  if (t === 'script') return 'script';
  if (t === 'stylesheet') return 'stylesheet';
  if (t === 'font') return 'font';
  if (t === 'media') return 'media';
  return t;
}

function fromBrokenLinks(links: BrokenLink[], pages: ScannedPageResult[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  const add = (fromUrl: string, toUrl: string, status: number, reason: string) => {
    const key = `link|${normalizeFindingUrl(toUrl)}|${status || 'timeout'}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(brokenLinkCandidate(fromUrl, toUrl, status, reason));
  };
  for (const p of pages) {
    const timeout = p.status === 'error' && (!p.statusCode || p.statusCode === 0);
    const httpFail = p.statusCode === 404 || p.statusCode === 410 || p.statusCode >= 500;
    if (httpFail || timeout) {
      add(p.linkedFrom ?? p.url, p.url, p.statusCode, timeout ? 'timeout' : String(p.statusCode));
    }
  }
  for (const l of links) add(l.sourcePageUrl, l.url, l.status, l.reason);
  return out;
}

function brokenLinkCandidate(fromUrl: string, toUrl: string, status: number, reason: string): Candidate {
  return {
    kind: 'broken_link',
    category: 'network',
    title: 'Broken internal link',
    summary: `${pathOf(fromUrl)} → ${pathOf(toUrl)}${status ? ` HTTP ${status}` : ''}`,
    description: `Internal navigation from ${fromUrl} to ${toUrl} (${reason})`,
    evidence: {
      type: 'broken_link',
      fromUrl: normalizeFindingUrl(fromUrl),
      url: normalizeFindingUrl(toUrl),
      status,
      reason,
      pageUrl: fromUrl,
    },
    location: { pageUrl: fromUrl, url: normalizeFindingUrl(toUrl) },
    pageUrl: fromUrl,
    observedAt: new Date().toISOString(),
    source: 'OBSERVED',
    confidence: 'HIGH',
    recContext: {},
    dedupeKey: `link|${normalizeFindingUrl(toUrl)}|${status || 'timeout'}`,
  };
}

function fromAccessibility(items: AccessibilityFinding[]): Candidate[] {
  return items.map((a) => {
    const kind = axeImpactToKind(a.impact);
    return {
      kind,
      category: 'accessibility' as const,
      title: a.help || a.rule,
      summary: `${a.rule} on ${pathOf(a.pageUrl)}`,
      description: a.description,
      evidence: {
        type: 'accessibility',
        rule: a.rule,
        impact: a.impact,
        pageUrl: a.pageUrl,
        target: a.selector,
        html: a.elementHtml,
        description: a.description,
        help: a.help,
        helpUrl: a.helpUrl,
      },
      location: { pageUrl: a.pageUrl, selector: a.selector },
      pageUrl: a.pageUrl,
      observedAt: new Date().toISOString(),
      source: 'OBSERVED',
      confidence: 'HIGH' as const,
      recContext: { rule: a.rule, help: a.help, description: a.description },
      dedupeKey: `a11y|${a.rule}|${a.pageUrl}|${a.selector}`,
    };
  });
}

function fromPerformance(perf: PerformanceMetrics): Candidate[] {
  const out: Candidate[] = [];
  const metrics: Array<{ name: PerfMetricName; value: number | 'NOT AVAILABLE' }> = [
    { name: 'lcp', value: perf.lcp },
    { name: 'fcp', value: perf.fcp },
    { name: 'cls', value: perf.cls },
    { name: 'ttfb', value: perf.ttfb },
  ];
  for (const m of metrics) {
    if (typeof m.value !== 'number') continue;
    const rating = ratePerfMetric(m.name, m.value);
    if (rating === 'good') continue;
    const kind = rating === 'poor' ? 'perf_poor' : 'perf_needs_improvement';
    const unit = m.name === 'cls' ? '' : 'ms';
    out.push({
      kind,
      category: 'performance',
      title: `${m.name.toUpperCase()} ${rating === 'poor' ? 'is poor' : 'needs improvement'}`,
      summary: `${m.name.toUpperCase()}=${m.value}${unit} (${rating.replace('_', ' ')})`,
      description: `${m.name.toUpperCase()} measured ${m.value}${unit}; rating ${rating.replace('_', ' ')} against documented thresholds.`,
      evidence: {
        type: 'performance',
        metric: m.name,
        value: m.value,
        rating,
        unit: unit || undefined,
      },
      location: {},
      pageUrl: '',
      observedAt: new Date().toISOString(),
      source: 'OBSERVED',
      confidence: 'MEDIUM',
      recContext: { metric: m.name },
      dedupeKey: `perf|${m.name}|${rating}`,
    });
  }
  return out;
}

function fromSecurity(items: SecurityFinding[], pages: ScannedPageResult[]): Candidate[] {
  const pageUrl = pages[0]?.url ?? '';
  return items
    .filter((s) => s.status === 'FAIL' || s.status === 'WARNING' || s.status === 'INFO')
    .filter((s) => s.status !== 'PASS' && s.status !== 'NOT TESTED')
    .map((s) => {
      const kind: SeverityKind =
        s.status === 'FAIL' ? 'security_fail' : s.status === 'WARNING' ? 'security_warning' : 'security_info';
      return {
        kind,
        category: 'security' as const,
        title: s.name.startsWith('Missing') || s.status !== 'PASS' ? missingTitle(s.name, s.status) : s.name,
        summary: s.evidence.slice(0, 200),
        description: s.evidence,
        evidence: {
          type: 'security',
          header: s.name,
          category: s.category,
          status: s.status,
          observed: s.evidence,
          pageUrl,
        },
        location: { pageUrl },
        pageUrl,
        observedAt: new Date().toISOString(),
        source: 'OBSERVED',
        confidence: s.status === 'FAIL' ? 'HIGH' as const : 'HIGH' as const,
        recContext: { name: s.name, evidence: s.evidence },
        dedupeKey: `security|${s.category}|${s.name}|${s.status}`,
      };
    });
}

function missingTitle(name: string, status: string): string {
  const headers = ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options'];
  if (headers.includes(name) && status !== 'PASS') return `Missing ${name}`;
  return name;
}

function fromSeo(items: SeoFinding[]): Candidate[] {
  const out: Candidate[] = [];
  for (const seo of items) {
    for (const issue of seo.issues) {
      const kind: SeverityKind =
        issue.severity === 'ERROR' ? 'seo_error' : issue.severity === 'WARNING' ? 'seo_warning' : 'seo_info';
      out.push({
        kind,
        category: 'seo',
        title: issue.message,
        summary: `${issue.message} on ${pathOf(seo.pageUrl)}`,
        description: issue.message,
        evidence: {
          type: 'seo',
          pageUrl: seo.pageUrl,
          message: issue.message,
          title: seo.title,
          metaDescription: seo.metaDescription,
          canonicalUrl: seo.canonicalUrl,
          lang: seo.lang,
        },
        location: { pageUrl: seo.pageUrl },
        pageUrl: seo.pageUrl,
        observedAt: new Date().toISOString(),
        source: 'OBSERVED',
        confidence: 'HIGH',
        recContext: { message: issue.message },
        dedupeKey: `seo|${seo.pageUrl}|${issue.message}`,
      });
    }
  }
  return out;
}

function dedupeAndFinalize(scanId: string, pages: ScannedPageResult[], candidates: Candidate[]): Finding[] {
  const pageIdByUrl = new Map(pages.map((p) => [p.url, p.id]));
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const list = groups.get(c.dedupeKey) ?? [];
    list.push(c);
    groups.set(c.dedupeKey, list);
  }
  const findings: Finding[] = [];
  for (const [dedupeKey, group] of groups) {
    const first = group[0];
    const last = group[group.length - 1];
    const pageSet = [...new Set(group.map((g) => g.pageUrl).filter(Boolean))];
    const occurrences = group.length;
    const evidence = redactEvidence({
      ...first.evidence,
      pages: pageSet,
      occurrences,
    });
    const severity = severityForKind(first.kind);
    const rec = recommendationFor(first.kind, first.recContext);
    findings.push({
      id: randomUUID(),
      scanId,
      pageId: pageIdByUrl.get(first.pageUrl),
      category: first.category,
      kind: first.kind,
      severity,
      title: first.title,
      summary: first.summary,
      description: first.description,
      evidence,
      evidenceText: evidenceTextFrom(evidence, occurrences),
      location: first.location,
      pages: pageSet,
      occurrences,
      firstObservedAt: first.observedAt,
      lastObservedAt: last.observedAt,
      source: first.source,
      confidence: first.confidence,
      recommendation: rec,
      whyItMatters: whyItMatters(first.kind, first.recContext),
      dedupeKey,
    });
  }
  const order: Record<string, number> = { CRITICAL: 0, ERROR: 1, WARNING: 2, INFO: 3 };
  findings.sort((a, b) => {
    const s = (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
    if (s !== 0) return s;
    return a.category.localeCompare(b.category) || a.title.localeCompare(b.title);
  });
  return findings;
}

function redactable(s: string): string {
  return s.slice(0, 4000);
}

export { ASSET_TYPES };
