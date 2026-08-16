import { describe, expect, it, vi } from 'vitest';
import { inCidr, isBlockedIp, isPrivateOrReservedIPv4 } from '../src/security/private-ip.ts';
import { assertSafeUrl, assertSafeRedirect, normalizeScanUrl, SsrfError } from '../src/security/ssrf.ts';
import { looksLikeSecret, looksLikeTokenKey, redactHeaders, redactUrl } from '../src/security/redact.ts';
import { normalizePageUrl, sameOrigin } from '../src/url/normalize.ts';
import { robotsBlocked, parseRobots, isBenignRequestFailure } from '../src/analysis/network.ts';
import { computeHealthScores, consoleNoiseScore, dedupeIssues, severityForIssue, accessibilityScore } from '../src/scoring/health.ts';
import { classifyConsoleSource } from '../src/scanner/console-source.ts';
import { analyzeCookies, analyzeCorsHeaders, analyzeSecurityHeaders } from '../src/analysis/security.ts';
import { isCorsOriginAllowed, parseCorsOrigins } from '../src/security/cors.ts';
import { shouldAutoStartApi } from '../src/api/entry.ts';
import { isFirstPartyHost } from '../src/url/normalize.ts';
import { isDangerousControl } from '../src/analysis/dom.ts';
import type { ConsoleEvent, DeduplicatedIssue, PerformanceMetrics } from '../../src/server/types/scan-types.ts';

describe('URL normalization', () => {
  it('defaults to https', () => {
    expect(normalizeScanUrl('example.com')).toBe('https://example.com/');
  });
  it('strips hash', () => {
    expect(normalizeScanUrl('https://example.com/a#x')).toBe('https://example.com/a');
  });
  it('rejects file urls', () => {
    expect(() => normalizeScanUrl('file:///etc/passwd')).toThrow(SsrfError);
  });
  it('normalizes page urls', () => {
    expect(normalizePageUrl('/b', 'https://ex.com/a')).toBe('https://ex.com/b');
  });
  it('same origin', () => {
    expect(sameOrigin('https://a.com/x', 'https://a.com/y')).toBe(true);
    expect(sameOrigin('https://a.com', 'https://b.com')).toBe(false);
  });
});

describe('SSRF / IP ranges', () => {
  it('detects private ipv4', () => {
    expect(isPrivateOrReservedIPv4('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIPv4('10.0.0.5')).toBe(true);
    expect(isPrivateOrReservedIPv4('192.168.1.1')).toBe(true);
    expect(isPrivateOrReservedIPv4('172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedIPv4('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIPv4('8.8.8.8')).toBe(false);
  });
  it('cidr', () => {
    expect(inCidr('10.1.2.3', '10.0.0.0/8')).toBe(true);
  });
  it('blocks ipv6 loopback', () => {
    expect(isBlockedIp('::1')).toBe(true);
  });
  it('rejects localhost unless allowed', async () => {
    await expect(assertSafeUrl('http://127.0.0.1/', { allowLocal: false })).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeUrl('http://127.0.0.1/', { allowLocal: true })).resolves.toContain('127.0.0.1');
  });
  it('rejects metadata host', async () => {
    await expect(assertSafeUrl('http://metadata.google.internal/', { allowLocal: true })).rejects.toBeInstanceOf(SsrfError);
  });
  it('blocks DNS rebinding to private IP', async () => {
    const resolver = await import('../src/security/dns-resolver.ts');
    const spy = vi.spyOn(resolver, 'lookupAll').mockResolvedValue([{ address: '10.0.0.99', family: 4 }]);
    await expect(assertSafeUrl('http://rebind.example.com/')).rejects.toBeInstanceOf(SsrfError);
    spy.mockRestore();
  });
  it('blocks IPv6 loopback literal', async () => {
    await expect(assertSafeUrl('http://[::1]/', { allowLocal: false })).rejects.toBeInstanceOf(SsrfError);
  });
  it('blocks redirect validation to private IP', async () => {
    await expect(assertSafeRedirect('http://127.0.0.1/', { allowLocal: false })).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeRedirect('http://10.0.0.1/', { allowLocal: false })).rejects.toBeInstanceOf(SsrfError);
  });
  it('blocks link-local IPv6', () => {
    expect(isBlockedIp('fe80::1')).toBe(true);
  });
});

describe('redaction', () => {
  it('redacts auth headers', () => {
    const h = redactHeaders({ Authorization: 'Bearer abc', 'Content-Type': 'application/json' });
    expect(h.Authorization).toBe('[REDACTED]');
    expect(h['Content-Type']).toBe('application/json');
  });
  it('redacts query tokens', () => {
    expect(redactUrl('https://x.com/?access_token=secret&q=1')).toMatch(/REDACTED/);
    expect(redactUrl('https://x.com/?q=1')).toContain('q=1');
  });
  it('detects jwt', () => {
    expect(looksLikeSecret('eyJhbGciOiJub25lIn0.e30.sig')).toBe(true);
    expect(looksLikeTokenKey('refresh_token')).toBe(true);
  });
});

describe('robots', () => {
  it('parses disallow', () => {
    const r = parseRobots('User-agent: *\nDisallow: /admin\n');
    expect(robotsBlocked('/admin/x', r.disallow)).toBe(true);
    expect(robotsBlocked('/public', r.disallow)).toBe(false);
  });
});

describe('severity and scoring', () => {
  it('maps severities', () => {
    expect(severityForIssue('runtime_exception')).toBe('CRITICAL');
    expect(severityForIssue('broken_asset', 404)).toBe('WARNING');
    expect(severityForIssue('console_log')).toBe('INFO');
  });
  it('console noise is deterministic', () => {
    const events: ConsoleEvent[] = [
      { id: '1', type: 'error', text: 'a', pageUrl: '/', timestamp: '', classification: 'RUNTIME_OBSERVED', source: 'TARGET' },
      { id: '2', type: 'warn', text: 'b', pageUrl: '/', timestamp: '', classification: 'RUNTIME_OBSERVED', source: 'TARGET' },
    ];
    const a = consoleNoiseScore(events);
    const b = consoleNoiseScore(events);
    expect(a.score).toBe(b.score);
    expect(a.score).toBe(100 - 8 - 3);
  });
  it('health overall is weighted average', () => {
    const perf: PerformanceMetrics = {
      fcp: 100,
      lcp: 200,
      cls: 0,
      inp: 'NOT AVAILABLE',
      ttfb: 50,
      domContentLoaded: 100,
      loadTime: 200,
      longTasksCount: 0,
      totalTransferSizeBytes: 1,
      jsSizeBytes: 1,
      cssSizeBytes: 0,
      imageSizeBytes: 0,
      fontSizeBytes: 0,
      requestCount: 1,
    };
    const s = computeHealthScores({
      consoleEvents: [],
      runtimeErrors: [],
      networkFailures: [],
      performance: perf,
      accessibility: [],
      securityFindings: [],
      seoFindings: [],
      brokenAssets: 0,
    });
    expect(s.overall).toBeGreaterThan(90);
    expect(s.explanations.overall.length).toBeGreaterThan(0);
  });
  it('dedupes issues', () => {
    const issues: DeduplicatedIssue[] = [
      { id: '1', type: 'network_5xx', category: 'NETWORK', severity: 'ERROR', title: 'POST /p 500', description: '', occurrences: 1, pages: ['/a'], evidence: { url: '/p', method: 'POST' } },
      { id: '2', type: 'network_5xx', category: 'NETWORK', severity: 'ERROR', title: 'POST /p 500', description: '', occurrences: 1, pages: ['/b'], evidence: { url: '/p', method: 'POST' } },
    ];
    const d = dedupeIssues(issues);
    expect(d).toHaveLength(1);
    expect(d[0].occurrences).toBe(2);
    expect(d[0].pages).toEqual(['/a', '/b']);
  });
});

describe('interaction rules', () => {
  it('blocks destructive labels', () => {
    expect(isDangerousControl('Delete account')).toBe(true);
    expect(isDangerousControl('Open menu')).toBe(false);
  });
});

describe('production-ready observation filters', () => {
  it('treats crawler aborts as benign', () => {
    expect(isBenignRequestFailure('net::ERR_ABORTED')).toBe(true);
    expect(isBenignRequestFailure('net::ERR_BLOCKED_BY_CLIENT')).toBe(true);
    expect(isBenignRequestFailure('net::ERR_CONNECTION_REFUSED')).toBe(false);
  });

  it('treats cookie domain as first-party of the page host', () => {
    expect(isFirstPartyHost('intel.com', 'www.intel.com')).toBe(true);
    expect(isFirstPartyHost('.intel.com', 'www.intel.com')).toBe(true);
    expect(isFirstPartyHost('intelcorp.scene7.com', 'www.intel.com')).toBe(false);
  });

  it('does not fail marketing sites for missing COEP', () => {
    const f = analyzeSecurityHeaders({ 'strict-transport-security': 'max-age=31536000' }, 'https://www.intel.com/');
    const coep = f.find((x) => x.name === 'Cross-Origin-Embedder-Policy');
    expect(coep?.status).toBe('INFO');
    const hsts = f.find((x) => x.name === 'Strict-Transport-Security');
    expect(hsts?.status).toBe('PASS');
  });

  it('records wildcard CORS as INFO, not a scored warning', () => {
    const f = analyzeCorsHeaders({ 'access-control-allow-origin': '*' }, 'https://cdn.example.com/x');
    expect(f[0].status).toBe('INFO');
  });

  it('does not flag third-party analytics cookies for missing HttpOnly', () => {
    const cookies = analyzeCookies(
      [{ name: '_ga', domain: '.google.com', path: '/', secure: true, httpOnly: false, sameSite: 'Lax' }],
      true,
      'www.intel.com',
    );
    expect(cookies[0].isRisky).toBe(false);
  });

  it('flags first-party session cookies missing HttpOnly', () => {
    const cookies = analyzeCookies(
      [{ name: 'sessionid', domain: '.intel.com', path: '/', secure: true, httpOnly: false, sameSite: 'Lax' }],
      true,
      'www.intel.com',
    );
    expect(cookies[0].isRisky).toBe(true);
  });

  it('scores unique accessibility rules, not every node', () => {
    const s = accessibilityScore([
      { id: '1', rule: 'button-name', impact: 'critical', description: 'x', helpUrl: '', elementHtml: '', selector: 'a', pageUrl: '/' },
      { id: '2', rule: 'button-name', impact: 'critical', description: 'x', helpUrl: '', elementHtml: '', selector: 'b', pageUrl: '/' },
      { id: '3', rule: 'button-name', impact: 'critical', description: 'x', helpUrl: '', elementHtml: '', selector: 'c', pageUrl: '/' },
    ]);
    expect(s.score).toBe(85);
  });

  it('caps console log-volume penalty', () => {
    const events: ConsoleEvent[] = Array.from({ length: 300 }, (_, i) => ({
      id: String(i),
      type: 'log' as const,
      text: `log-${i % 3}`,
      pageUrl: '/',
      timestamp: '',
      classification: 'RUNTIME_OBSERVED' as const,
      source: 'TARGET' as const,
    }));
    expect(consoleNoiseScore(events).score).toBeGreaterThanOrEqual(65);
  });
  it('ignores scanner and browser console noise when scoring the site', () => {
    const events: ConsoleEvent[] = [
      {
        id: '1',
        type: 'log',
        text: 'Deprecated API for given entry type.',
        pageUrl: 'https://example.com/',
        timestamp: '',
        classification: 'RUNTIME_OBSERVED',
        source: 'SCANNER',
      },
      {
        id: '2',
        type: 'error',
        text: 'chrome internals',
        pageUrl: 'https://example.com/',
        timestamp: '',
        classification: 'RUNTIME_OBSERVED',
        source: 'BROWSER',
      },
    ];
    expect(consoleNoiseScore(events).score).toBe(100);
  });
});

describe('console source attribution', () => {
  it('attributes page scripts to TARGET', () => {
    expect(
      classifyConsoleSource({
        text: 'fixture-error-message',
        sourceUrl: 'http://127.0.0.1:4173/console',
        pageUrl: 'http://127.0.0.1:4173/console',
      }),
    ).toBe('TARGET');
  });
  it('attributes TRACE performance collection noise to SCANNER', () => {
    expect(
      classifyConsoleSource({
        text: 'Deprecated API for given entry type.',
        sourceUrl: 'https://example.com/',
        pageUrl: 'https://example.com/',
      }),
    ).toBe('SCANNER');
  });
  it('attributes Chrome resource-load console lines to BROWSER', () => {
    expect(
      classifyConsoleSource({
        text: 'Failed to load resource: the server responded with a status of 404 (Not Found)',
        sourceUrl: 'http://127.0.0.1:4173/broken-assets',
        pageUrl: 'http://127.0.0.1:4173/broken-assets',
      }),
    ).toBe('BROWSER');
  });
  it('attributes Chrome extension messages to BROWSER', () => {
    expect(
      classifyConsoleSource({
        text: 'extension debug',
        sourceUrl: 'chrome-extension://abcd/content.js',
        pageUrl: 'https://example.com/',
      }),
    ).toBe('BROWSER');
  });
});

describe('CORS allowlist', () => {
  it('allows missing Origin (native Expo)', () => {
    expect(isCorsOriginAllowed(undefined, [])).toBe(true);
  });
  it('denies unknown browser origins in production allowlist', () => {
    expect(isCorsOriginAllowed('https://evil.example', [])).toBe(false);
    expect(isCorsOriginAllowed('https://app.example', ['https://app.example'])).toBe(true);
  });
  it('allows wildcard', () => {
    expect(isCorsOriginAllowed('https://anywhere.example', ['*'])).toBe(true);
  });
  it('defaults wildcard outside production', () => {
    expect(parseCorsOrigins(undefined, 'development')).toEqual(['*']);
    expect(parseCorsOrigins(undefined, 'production')).toEqual([]);
  });
});

describe('API process entry detection', () => {
  it('starts when tsx is argv[1] and the API file is later', () => {
    expect(
      shouldAutoStartApi(['node', '/app/node_modules/tsx/dist/cli.mjs', 'server/src/api/index.ts']),
    ).toBe(true);
  });
  it('starts for absolute Docker paths', () => {
    expect(shouldAutoStartApi(['node', '/app/server/src/api/index.ts'])).toBe(true);
  });
  it('does not start when imported by vitest', () => {
    expect(shouldAutoStartApi(['node', '/app/node_modules/vitest/vitest.mjs'])).toBe(false);
  });
});
