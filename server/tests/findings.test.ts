import { describe, expect, it } from 'vitest';
import { buildFindings, type FindingsInput } from '../src/findings/pipeline.ts';
import { recommendationFor } from '../src/findings/recommendations.ts';
import { evidenceTextFrom, redactEvidence } from '../src/findings/evidence.ts';
import { axeImpactToKind, networkKindForFailure, severityForKind, SEVERITY_RULES } from '../src/findings/severity.ts';
import { ratePerfMetric } from '../src/findings/thresholds.ts';
import { computeHealthScores, FINDING_PENALTIES, penaltyForFinding, scoreFindings } from '../src/scoring/health.ts';
import { classifyConsoleSource, mapPlaywrightConsoleType } from '../src/scanner/console-source.ts';
import { consoleNoiseScore } from '../src/scoring/health.ts';
import type {
  AccessibilityFinding,
  ConsoleEvent,
  Finding,
  NetworkFailure,
  PerformanceMetrics,
  RuntimeErrorEvent,
  ScannedPageResult,
} from '../../src/server/types/scan-types.ts';

function emptyPerf(over: Partial<PerformanceMetrics> = {}): PerformanceMetrics {
  return {
    fcp: 'NOT AVAILABLE',
    lcp: 'NOT AVAILABLE',
    cls: 'NOT AVAILABLE',
    inp: 'NOT AVAILABLE',
    ttfb: 'NOT AVAILABLE',
    domContentLoaded: 'NOT AVAILABLE',
    loadTime: 'NOT AVAILABLE',
    longTasksCount: 0,
    totalTransferSizeBytes: 0,
    jsSizeBytes: 0,
    cssSizeBytes: 0,
    imageSizeBytes: 0,
    fontSizeBytes: 0,
    requestCount: 0,
    ...over,
  };
}

function page(url: string, over: Partial<ScannedPageResult> = {}): ScannedPageResult {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    url,
    title: 't',
    status: 'healthy',
    statusCode: 200,
    issuesCount: 0,
    duration: 10,
    depth: 0,
    ...over,
  };
}

function consoleEv(over: Partial<ConsoleEvent>): ConsoleEvent {
  return {
    id: 'c1',
    type: 'log',
    text: 'x',
    pageUrl: 'https://ex.test/',
    timestamp: '2026-01-01T00:00:00.000Z',
    classification: 'RUNTIME_OBSERVED',
    source: 'TARGET',
    ...over,
  };
}

function findingsOf(partial: Partial<FindingsInput>) {
  return buildFindings({
    scanId: 'scan-1',
    pages: [page('https://ex.test/')],
    consoleEvents: [],
    runtimeErrors: [],
    networkFailures: [],
    brokenResources: [],
    brokenLinks: [],
    accessibility: [],
    securityFindings: [],
    seoFindings: [],
    performance: emptyPerf(),
    ...partial,
  });
}

describe('console source attribution', () => {
  it('maps Playwright warning to warn', () => {
    expect(mapPlaywrightConsoleType('warning')).toBe('warn');
    expect(mapPlaywrightConsoleType('error')).toBe('error');
  });

  it('SCANNER console event is stored as SCANNER and excluded from target console findings and penalty', () => {
    const events: ConsoleEvent[] = [
      consoleEv({
        id: '1',
        type: 'log',
        text: 'Deprecated API for given entry type.',
        source: classifyConsoleSource({
          text: 'Deprecated API for given entry type.',
          sourceUrl: 'https://example.com/',
          pageUrl: 'https://example.com/',
        }),
      }),
      consoleEv({
        id: '2',
        type: 'error',
        text: 'fixture-error-message',
        source: 'TARGET',
      }),
    ];
    expect(events[0].source).toBe('SCANNER');
    const findings = findingsOf({ consoleEvents: events });
    expect(findings.some((f) => f.category === 'console' && f.summary.includes('Deprecated'))).toBe(false);
    expect(findings.some((f) => f.kind === 'console_error' && f.summary.includes('fixture-error-message'))).toBe(true);
    expect(consoleNoiseScore(events).score).toBe(100 - 8);
  });

  it('BROWSER Failed to load resource does not become a TARGET console error', () => {
    const text = 'Failed to load resource: the server responded with a status of 404 (Not Found)';
    const source = classifyConsoleSource({
      text,
      sourceUrl: 'http://127.0.0.1:4173/broken-assets',
      pageUrl: 'http://127.0.0.1:4173/broken-assets',
    });
    expect(source).toBe('BROWSER');
    const findings = findingsOf({
      consoleEvents: [consoleEv({ type: 'error', text, source })],
      brokenResources: [
        {
          url: 'http://127.0.0.1:4173/images/missing.png',
          pageUrl: 'http://127.0.0.1:4173/broken-assets',
          resourceType: 'image',
          status: 404,
        },
      ],
    });
    expect(findings.some((f) => f.category === 'console')).toBe(false);
    expect(findings.some((f) => f.kind === 'asset_broken')).toBe(true);
  });

  it('TARGET console.error becomes a website finding', () => {
    const findings = findingsOf({
      consoleEvents: [consoleEv({ type: 'error', text: 'Payment failed', source: 'TARGET' })],
    });
    const f = findings.find((x) => x.kind === 'console_error');
    expect(f?.severity).toBe('ERROR');
    expect(f?.source).toBe('TARGET');
    expect(f?.confidence).toBe('HIGH');
  });

  it('TARGET console.warn maps to WARNING', () => {
    const findings = findingsOf({
      consoleEvents: [consoleEv({ type: 'warn', text: 'fixture-warn-message', source: 'TARGET' })],
    });
    expect(findings.find((x) => x.kind === 'console_warn')?.severity).toBe('WARNING');
  });
});

describe('runtime deduplication', () => {
  it('groups identical exceptions', () => {
    const err = (id: string): RuntimeErrorEvent => ({
      id,
      message: 'fixture-uncaught-exception',
      stack: 'Error: fixture-uncaught-exception\n    at https://ex.test/app.js:10:2',
      pageUrl: 'https://ex.test/runtime',
      timestamp: '2026-01-01T00:00:00.000Z',
      sourceUrl: 'https://ex.test/app.js',
      line: 10,
      column: 2,
      type: 'pageerror',
    });
    const findings = findingsOf({ runtimeErrors: [err('a'), err('b'), err('c')] });
    const runtime = findings.filter((f) => f.category === 'runtime');
    expect(runtime).toHaveLength(1);
    expect(runtime[0].occurrences).toBe(3);
    expect(runtime[0].severity).toBe('CRITICAL');
  });

  it('creates an unhandled rejection finding', () => {
    const findings = findingsOf({
      runtimeErrors: [
        {
          id: 'r',
          message: 'fixture-unhandled-rejection',
          pageUrl: 'https://ex.test/runtime',
          timestamp: '2026-01-01T00:00:00.000Z',
          type: 'unhandled_rejection',
        },
      ],
    });
    const f = findings.find((x) => x.kind === 'runtime_unhandled_rejection');
    expect(f?.severity).toBe('ERROR');
    expect(f?.evidence.source).toBe('Source location unavailable');
  });
});

describe('network and asset classification', () => {
  it('classifies HTTP statuses', () => {
    expect(networkKindForFailure({ status: 500, reason: '500' })).toBe('network_5xx');
    expect(networkKindForFailure({ status: 404, reason: '404' })).toBe('network_404');
    expect(networkKindForFailure({ status: 403, reason: '403' })).toBe('network_403');
    expect(networkKindForFailure({ status: 0, reason: 'net::ERR_TIMED_OUT' })).toBe('network_timeout');
    expect(networkKindForFailure({ status: 0, reason: 'net::ERR_NAME_NOT_RESOLVED' })).toBe('network_dns');
    expect(networkKindForFailure({ status: 0, reason: 'CORS error' })).toBe('network_cors');
  });

  it('creates an API 500 finding and does not call every request an API', () => {
    const apiFail: NetworkFailure = {
      id: 'n1',
      url: 'https://ex.test/api/fail',
      method: 'POST',
      status: 500,
      reason: '500 Internal Server Error',
      pageUrl: 'https://ex.test/network',
      resourceType: 'fetch',
      duration: 842,
    };
    const docFail: NetworkFailure = {
      id: 'n2',
      url: 'https://ex.test/missing-page',
      method: 'GET',
      status: 404,
      reason: '404',
      pageUrl: 'https://ex.test/',
      resourceType: 'document',
      duration: 20,
    };
    const findings = findingsOf({
      pages: [
        page('https://ex.test/'),
        page('https://ex.test/missing-page', {
          id: '22222222-2222-4222-8222-222222222222',
          statusCode: 404,
          status: 'error',
          linkedFrom: 'https://ex.test/',
        }),
      ],
      networkFailures: [apiFail, docFail],
    });
    const api = findings.find((f) => f.kind === 'network_5xx');
    expect(api?.title).toContain('API request returned 500');
    expect(api?.evidence.method).toBe('POST');
    expect(api?.evidence.status).toBe(500);
    expect(findings.find((f) => f.kind === 'broken_link')?.title).toBe('Broken internal link');
  });

  it('classifies broken image as an asset finding', () => {
    const findings = findingsOf({
      brokenResources: [
        {
          url: 'https://ex.test/assets/logo.png',
          pageUrl: 'https://ex.test/broken-assets',
          resourceType: 'image',
          status: 404,
        },
      ],
    });
    const f = findings.find((x) => x.kind === 'asset_broken');
    expect(f?.severity).toBe('WARNING');
    expect(f?.title).toBe('Broken image resource');
    expect(f?.recommendation).toContain('asset path');
  });
});

describe('axe severity mapping', () => {
  it('maps axe impact deterministically', () => {
    expect(severityForKind(axeImpactToKind('critical'))).toBe('CRITICAL');
    expect(severityForKind(axeImpactToKind('serious'))).toBe('ERROR');
    expect(severityForKind(axeImpactToKind('moderate'))).toBe('WARNING');
    expect(severityForKind(axeImpactToKind('minor'))).toBe('INFO');
  });

  it('builds accessibility findings with rule, target, and help URL', () => {
    const a: AccessibilityFinding = {
      id: 'a1',
      rule: 'label',
      impact: 'serious',
      description: 'Form elements must have labels',
      help: 'Form elements must have labels',
      helpUrl: 'https://dequeuniversity.com/rules/axe/label',
      elementHtml: '<input name="email">',
      selector: 'input[name="email"]',
      pageUrl: 'https://ex.test/forms',
    };
    const f = findingsOf({ accessibility: [a] }).find((x) => x.category === 'accessibility');
    expect(f?.severity).toBe('ERROR');
    expect(f?.evidence.rule).toBe('label');
    expect(f?.evidence.target).toBe('input[name="email"]');
    expect(f?.recommendation).toContain('visible label');
  });
});

describe('finding deduplication', () => {
  it('groups repeated console errors', () => {
    const events = Array.from({ length: 17 }, (_, i) =>
      consoleEv({
        id: String(i),
        type: 'error',
        text: 'Payment failed',
        pageUrl: i < 10 ? 'https://ex.test/a' : 'https://ex.test/b',
      }),
    );
    const findings = findingsOf({
      pages: [page('https://ex.test/a'), page('https://ex.test/b', { id: '22222222-2222-4222-8222-222222222222' })],
      consoleEvents: events,
    });
    const f = findings.find((x) => x.kind === 'console_error');
    expect(f?.occurrences).toBe(17);
    expect(f?.pages).toHaveLength(2);
  });
});

describe('severity calculation', () => {
  it('uses centralized rules', () => {
    expect(SEVERITY_RULES.console_error).toBe('ERROR');
    expect(SEVERITY_RULES.network_5xx).toBe('ERROR');
    expect(SEVERITY_RULES.asset_broken).toBe('WARNING');
    expect(SEVERITY_RULES.console_excess_log).toBe('INFO');
  });
});

describe('recommendation generation', () => {
  it('returns deterministic recommendations', () => {
    expect(recommendationFor('network_5xx', {})).toContain('server-side');
    expect(recommendationFor('asset_broken', { resourceType: 'image' })).toContain('asset path');
    expect(recommendationFor('runtime_pageerror', {})).toContain('stack trace');
    expect(recommendationFor('a11y_serious', { rule: 'image-alt' })).toContain('alternative text');
  });
});

describe('score calculation', () => {
  it('does not penalize INFO findings', () => {
    const info: Finding = {
      id: '1',
      scanId: 's',
      category: 'console',
      kind: 'console_excess_log',
      severity: 'INFO',
      title: 'logs',
      summary: '',
      description: '',
      evidence: { type: 'console' },
      evidenceText: '',
      location: {},
      pages: [],
      occurrences: 400,
      firstObservedAt: '',
      lastObservedAt: '',
      source: 'TARGET',
      confidence: 'HIGH',
      recommendation: '',
      whyItMatters: '',
      dedupeKey: 'x',
    };
    expect(penaltyForFinding(info)).toBe(0);
    expect(scoreFindings([info]).score).toBe(100);
  });

  it('applies documented penalties', () => {
    expect(FINDING_PENALTIES.CRITICAL).toBe(18);
    expect(FINDING_PENALTIES.ERROR).toBe(10);
    expect(FINDING_PENALTIES.WARNING).toBe(4);
    const s = computeHealthScores({
      consoleEvents: [consoleEv({ type: 'error', text: 'e' })],
      runtimeErrors: [],
      networkFailures: [],
      performance: emptyPerf({ lcp: 100, fcp: 100, cls: 0, ttfb: 50 }),
      accessibility: [],
      securityFindings: [],
      seoFindings: [],
      brokenAssets: 0,
    });
    expect(s.console).toBe(90);
    expect(s.explanations.overall.join(' ')).toContain('CRITICAL=18');
  });

  it('does not generate performance findings from unavailable metrics', () => {
    const findings = findingsOf({ performance: emptyPerf() });
    expect(findings.some((f) => f.category === 'performance')).toBe(false);
  });

  it('creates a performance finding when a threshold is exceeded', () => {
    expect(ratePerfMetric('lcp', 5000)).toBe('poor');
    const findings = findingsOf({ performance: emptyPerf({ lcp: 5000, fcp: 100, cls: 0, ttfb: 50 }) });
    expect(findings.some((f) => f.kind === 'perf_poor' && String(f.evidence.metric) === 'lcp')).toBe(true);
  });
});

describe('redaction', () => {
  it('redacts secrets in evidence', () => {
    const ev = redactEvidence({
      type: 'network',
      url: 'https://ex.test/api?access_token=secret',
      authorization: 'Bearer abc',
    });
    expect(String(ev.url)).toMatch(/REDACTED/);
    expect(ev.authorization).toBe('[REDACTED]');
    const text = evidenceTextFrom(ev, 3);
    expect(text).toContain('observed 3 times');
  });
});
