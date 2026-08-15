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

    expect(result.pages.length).toBeGreaterThan(1);
    expect(result.consoleEvents.some((e) => e.text.includes('fixture-error-message'))).toBe(true);
    expect(result.runtimeErrors.some((e) => e.message.includes('fixture-uncaught-exception'))).toBe(true);
    expect(result.networkFailures.some((e) => e.url.includes('/api/fail') && e.status === 500)).toBe(true);
    expect(result.brokenResources.some((e) => e.url.includes('missing.png') && e.status === 404)).toBe(true);
    expect(result.accessibility.length).toBeGreaterThan(0);
    expect(result.scores.overall).toBeGreaterThanOrEqual(0);
    expect(result.scores.overall).toBeLessThanOrEqual(100);
    expect(result.scan.status === 'completed' || result.scan.status === 'completed_with_warnings').toBe(true);
  }, 180_000);
});
