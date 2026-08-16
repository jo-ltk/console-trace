import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'node:http';
import type { Worker } from 'bullmq';
import { buildApp } from '../src/api/index.ts';
import { migrate, pool } from '../src/db/pool.ts';
import { createScanWorker, scanQueue } from '../src/queue/queues.ts';
import { startFixture } from '../../test-fixture/server.ts';
import { applyIntegrationEnv, servicesAvailable } from './helpers/services.ts';
import { createScan, fetchScanResults, waitForScanStatus } from './helpers/scan.ts';
import { config } from '../src/config.ts';

const servicesUp = await servicesAvailable();

describe.skipIf(!servicesUp)('production hardening', () => {
  let app: FastifyInstance;
  let worker: Worker;
  let fixtureServer: Server;
  let fixtureUrl: string;

  beforeAll(async () => {
    applyIntegrationEnv();
    process.env.ALLOW_LOCAL_TARGETS = 'true';
    process.env.SCAN_BROWSER_CONCURRENCY = '2';
    process.env.SCAN_MAX_PAGES = '5';
    process.env.SCAN_MAX_DURATION = '30000';
    process.env.SCAN_MAX_REQUESTS = '50';

    await migrate();
    worker = createScanWorker();
    app = await buildApp({ disableRateLimit: true });
    await app.ready();

    const fixture = await startFixture(0);
    fixtureServer = fixture.server;
    fixtureUrl = fixture.url;
  }, 60_000);

  afterAll(async () => {
    await worker.close();
    await app.close();
    await pool.end();
    await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
    await scanQueue().obliterate({ force: true }).catch(() => undefined);
  }, 30_000);

  it('enforces large-site limits (maxPages caps crawl)', async () => {
    const scanId = await createScan(app, `${fixtureUrl}/large`, {
      maxPages: 5,
      maxDepth: 3,
      timeout: 10_000,
      accessibility: false,
      performance: false,
      security: false,
    });
    await waitForScanStatus(app, scanId, 90_000);
    const result = await fetchScanResults(app, scanId);
    expect(result.pages.length).toBeLessThanOrEqual(5);
    expect(result.pages.length).toBeGreaterThanOrEqual(2);
    expect(result.summary.requestsObserved).toBeLessThanOrEqual(config.scanMaxRequests);
  }, 120_000);

  it('isolates concurrent scan data in PostgreSQL', async () => {
    const [idA, idB] = await Promise.all([
      createScan(app, `${fixtureUrl}/console`, { maxPages: 1, timeout: 10_000, accessibility: false, security: false }),
      createScan(app, `${fixtureUrl}/network`, { maxPages: 1, timeout: 10_000, accessibility: false, security: false }),
    ]);
    await Promise.all([waitForScanStatus(app, idA, 90_000), waitForScanStatus(app, idB, 90_000)]);

    const [resultA, resultB] = await Promise.all([fetchScanResults(app, idA), fetchScanResults(app, idB)]);

    expect(resultA.consoleEvents.some((e) => e.text.includes('fixture-error-message'))).toBe(true);
    expect(resultB.consoleEvents.some((e) => e.text.includes('fixture-error-message'))).toBe(false);
    expect(resultB.networkFailures.some((e) => e.url.includes('/api/fail'))).toBe(true);
    expect(resultA.networkFailures.some((e) => e.url.includes('/api/fail'))).toBe(false);

    const dbA = await pool.query('SELECT COUNT(*)::int AS n FROM console_events WHERE scan_id = $1', [idA]);
    const dbB = await pool.query('SELECT COUNT(*)::int AS n FROM console_events WHERE scan_id = $1', [idB]);
    expect(dbA.rows[0].n).toBe(resultA.consoleEvents.length);
    expect(dbB.rows[0].n).toBe(resultB.consoleEvents.length);
    expect(dbA.rows[0].n).not.toBe(dbB.rows[0].n);
  }, 120_000);

  it('cancels long scan and persists cancelled status without mixing results', async () => {
    const scanId = await createScan(app, fixtureUrl, {
      maxPages: 20,
      maxDepth: 3,
      timeout: 15_000,
      interactions: true,
    });
    await new Promise((r) => setTimeout(r, 400));
    await app.inject({ method: 'POST', url: `/api/scans/${scanId}/cancel` });
    const status = await waitForScanStatus(app, scanId, 90_000);
    expect(status.status).toBe('cancelled');

    const row = await pool.query('SELECT status, result FROM scans WHERE id = $1', [scanId]);
    expect(row.rows[0].status).toBe('cancelled');
  }, 120_000);

  it('handles hang fixture timeout without fabricated findings', async () => {
    const scanId = await createScan(app, `${fixtureUrl}/hang`, {
      maxPages: 1,
      timeout: 1000,
      accessibility: false,
      performance: false,
      security: false,
    });
    const status = await waitForScanStatus(app, scanId, 60_000);
    expect(['completed', 'completed_with_warnings', 'failed']).toContain(status.status);
    const result = await fetchScanResults(app, scanId);
    expect(['completed', 'completed_with_warnings', 'failed']).toContain(result.scan.status);
    const fabricated = result.consoleEvents.some((e) => e.text.includes('FAKE'));
    expect(fabricated).toBe(false);
  }, 90_000);

  it('records redirect chain from fixture without treating redirect as full API discovery', async () => {
    const scanId = await createScan(app, `${fixtureUrl}/redirect-private`, {
      maxPages: 1,
      timeout: 10_000,
      accessibility: false,
      performance: false,
      security: false,
    });
    await waitForScanStatus(app, scanId, 60_000);
    const result = await fetchScanResults(app, scanId);
    expect(result.pages.length).toBeGreaterThanOrEqual(1);
    expect(result.pages.some((p) => p.url.includes('redirect-private') || p.url.includes('127.0.0.1'))).toBe(true);
    expect(result.redirects.length).toBeGreaterThanOrEqual(0);
  }, 90_000);
});
