import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixture } from '../../test-fixture/server.ts';
import { runScanEngine } from '../src/scanner/engine.ts';
import type { Server } from 'node:http';

describe('fixture chromium scan', () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    const f = await startFixture(0);
    server = f.server;
    url = f.url;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('observes real console, runtime, network, 404 assets, accessibility, pages', async () => {
    const result = await runScanEngine({
      scanId: '00000000-0000-4000-8000-000000000001',
      url,
      options: {
        maxPages: 12,
        maxDepth: 2,
        timeout: 15000,
        device: 'mobile',
        accessibility: true,
        performance: true,
        security: true,
        interactions: false,
      },
    });

    expect(result.pages.length).toBeGreaterThanOrEqual(10);
    const pageUrls = result.pages.map((p) => p.url);
    expect(new Set(pageUrls).size).toBe(result.pages.length);
    expect(pageUrls.some((u) => u.endsWith('/console'))).toBe(true);
    expect(pageUrls.some((u) => u.endsWith('/runtime'))).toBe(true);
    expect(pageUrls.some((u) => u.endsWith('/network'))).toBe(true);
    expect(result.consoleEvents.some((e) => e.text.includes('fixture-error-message') && e.source === 'TARGET')).toBe(true);
    expect(result.summary.consoleEvents).toBe(result.summary.consoleTargetEvents);
    expect(
      result.consoleEvents
        .filter((e) => e.text.includes('Deprecated API for given entry type.'))
        .every((e) => e.source === 'SCANNER'),
    ).toBe(true);
    expect(result.findings.some((f) => f.kind === 'console_error' && f.summary.includes('fixture-error-message'))).toBe(true);
    expect(result.findings.some((f) => f.category === 'console' && f.source === 'SCANNER')).toBe(false);
    expect(result.findings.some((f) => f.kind === 'console_error' && /Failed to load resource/i.test(f.summary))).toBe(false);
    expect(result.runtimeErrors.some((e) => e.message.includes('fixture-uncaught-exception'))).toBe(true);
    expect(result.findings.some((f) => f.category === 'runtime' && f.summary.includes('fixture-uncaught-exception'))).toBe(true);
    expect(result.findings.some((f) => f.kind === 'runtime_unhandled_rejection')).toBe(true);
    expect(result.networkFailures.some((e) => e.url.includes('/api/fail') && e.status === 500)).toBe(true);
    expect(result.findings.some((f) => f.kind === 'network_5xx' && String(f.evidence.url).includes('/api/fail'))).toBe(true);
    expect(result.brokenResources.some((e) => e.url.includes('missing.png') && e.status === 404)).toBe(true);
    expect(result.findings.some((f) => f.kind === 'asset_broken' && String(f.evidence.url).includes('missing.png'))).toBe(true);
    expect(result.findings.some((f) => f.kind === 'broken_link')).toBe(true);
    expect(result.accessibility.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.category === 'accessibility')).toBe(true);
    expect(result.findings.some((f) => f.category === 'security')).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
    const consoleErrors = result.findings.filter((f) => f.kind === 'console_error' && f.summary.includes('fixture-error-message'));
    expect(consoleErrors.length).toBe(1);
    expect(result.scores.overall).toBeGreaterThanOrEqual(0);
    expect(result.scores.overall).toBeLessThanOrEqual(100);
    expect(result.scores.explanations.overall.length).toBeGreaterThan(0);
    expect(result.scan.status === 'completed' || result.scan.status === 'completed_with_warnings').toBe(true);
  }, 180_000);
});

describe('public smoke example.com', () => {
  it('does not present SCANNER console events as website console findings', async () => {
    const result = await runScanEngine({
      scanId: '00000000-0000-4000-8000-0000000000aa',
      url: 'https://example.com/',
      options: {
        maxPages: 1,
        maxDepth: 0,
        timeout: 20000,
        device: 'mobile',
        accessibility: true,
        performance: true,
        security: true,
        interactions: false,
      },
    });
    const scanner = result.consoleEvents.filter((e) => e.source === 'SCANNER');
    expect(scanner.every((e) => e.source === 'SCANNER')).toBe(true);
    expect(result.findings.filter((f) => f.category === 'console').every((f) => f.source === 'TARGET')).toBe(true);
    expect(result.findings.some((f) => f.category === 'console' && /Deprecated API for given entry type/i.test(f.summary))).toBe(
      false,
    );
    for (const f of result.findings) {
      expect(f.evidence).toBeTruthy();
      expect(f.evidence.type).toBeTruthy();
    }
    expect(result.scan.status === 'completed' || result.scan.status === 'completed_with_warnings').toBe(true);
  }, 120_000);
});
