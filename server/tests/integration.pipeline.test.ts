import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'node:http';
import type { Worker } from 'bullmq';
import { buildApp } from '../src/api/index.ts';
import { migrate, pool } from '../src/db/pool.ts';
import { createScanWorker, scanQueue } from '../src/queue/queues.ts';
import { startFixture } from '../../test-fixture/server.ts';
import { toClientScan } from '../../src/services/adapter.ts';
import { applyIntegrationEnv, servicesAvailable } from './helpers/services.ts';
import { createScan, fetchScanResults, waitForScanStatus } from './helpers/scan.ts';

const servicesUp = await servicesAvailable();

describe.skipIf(!servicesUp)('integration suite', () => {
  let app: FastifyInstance;
  let worker: Worker | undefined;
  let fixtureServer: Server | undefined;
  let fixtureUrl: string;

  beforeAll(async () => {
    applyIntegrationEnv();
    process.env.ALLOW_LOCAL_TARGETS = 'true';
    process.env.SCAN_BROWSER_CONCURRENCY = '2';

    await migrate();
    app = await buildApp({ disableRateLimit: true });
    await app.ready();

    const fixture = await startFixture(0);
    fixtureServer = fixture.server;
    fixtureUrl = fixture.url;
  }, 60_000);

  afterAll(async () => {
    await worker?.close();
    await app.close();
    await pool.end();
    if (fixtureServer) {
      await new Promise<void>((resolve) => fixtureServer!.close(() => resolve()));
    }
    await scanQueue().obliterate({ force: true }).catch(() => undefined);
  }, 30_000);

  describe('full scan pipeline (API → BullMQ → Worker → Playwright → PostgreSQL)', () => {
    beforeAll(() => {
      worker = createScanWorker();
    });

    it('completes a fixture scan with real observed findings via POST /api/scans', async () => {
      const scanId = await createScan(app, fixtureUrl, {
        maxPages: 12,
        maxDepth: 2,
        timeout: 15_000,
        device: 'mobile',
        accessibility: true,
        performance: true,
        security: true,
        interactions: false,
      });

      const status = await waitForScanStatus(app, scanId, 120_000);
      expect(['completed', 'completed_with_warnings']).toContain(status.status);

      const result = await fetchScanResults(app, scanId);
      expect(result.scan.id).toBe(scanId);
      expect(result.pages.length).toBeGreaterThanOrEqual(5);
      expect(new Set(result.pages.map((p) => p.url)).size).toBe(result.pages.length);
      expect(result.summary.requestsObserved).toBeGreaterThan(0);
      expect(result.consoleEvents.some((e) => e.text.includes('fixture-error-message') && e.source === 'TARGET')).toBe(true);
      expect(result.runtimeErrors.some((e) => e.message.includes('fixture-uncaught-exception'))).toBe(true);
      expect(result.networkFailures.some((e) => e.url.includes('/api/fail') && e.status === 500)).toBe(true);
      expect(result.brokenResources.some((e) => e.url.includes('missing.png') && e.status === 404)).toBe(true);
      expect(result.accessibility.length).toBeGreaterThan(0);
      expect(result.findings.some((f) => f.kind === 'console_error')).toBe(true);
      expect(result.findings.some((f) => f.kind === 'network_5xx')).toBe(true);
      expect(result.findings.some((f) => f.kind === 'asset_broken')).toBe(true);
      expect(result.findings.length).toBe(result.summary.findings);

      const findingsRes = await app.inject({ method: 'GET', url: `/api/scans/${scanId}/findings?severity=ERROR` });
      expect(findingsRes.statusCode).toBe(200);
      const findingsBody = findingsRes.json() as { findings: Array<{ severity: string }> };
      expect(findingsBody.findings.every((f) => f.severity === 'ERROR')).toBe(true);
      expect(result.scores.overall).toBeGreaterThanOrEqual(0);
      expect(result.scores.overall).toBeLessThanOrEqual(100);

      const meta = await app.inject({ method: 'GET', url: `/api/scans/${scanId}` });
      expect(meta.statusCode).toBe(200);
      const metaBody = meta.json() as { scores: { overall: number }; summary: Record<string, number> };
      expect(metaBody.scores.overall).toBe(result.scores.overall);
      expect(metaBody.summary.pagesScanned).toBe(result.summary.pagesScanned);
    }, 150_000);

    it('serves slice endpoints from PostgreSQL after worker completion', async () => {
      const scanId = await createScan(app, `${fixtureUrl}/console`, {
        maxPages: 1,
        timeout: 10_000,
        accessibility: false,
        performance: false,
        security: false,
      });
      await waitForScanStatus(app, scanId, 60_000);

      const consoleRes = await app.inject({ method: 'GET', url: `/api/scans/${scanId}/console` });
      expect(consoleRes.statusCode).toBe(200);
      const consoleBody = consoleRes.json() as unknown[];
      expect(Array.isArray(consoleBody)).toBe(true);
      expect(consoleBody.length).toBeGreaterThan(0);

      const networkRes = await app.inject({ method: 'GET', url: `/api/scans/${scanId}/network` });
      expect(networkRes.statusCode).toBe(200);

      const issuesRes = await app.inject({ method: 'GET', url: `/api/scans/${scanId}/issues` });
      expect(issuesRes.statusCode).toBe(200);
    }, 90_000);

    it('maps API results to mobile client shape (mobile → API → worker → DB → API)', async () => {
      const scanId = await createScan(app, `${fixtureUrl}/network`, {
        maxPages: 1,
        timeout: 10_000,
        accessibility: false,
        performance: true,
        security: false,
      });
      await waitForScanStatus(app, scanId, 60_000);

      const raw = await app.inject({ method: 'GET', url: `/api/scans/${scanId}/results` });
      const client = toClientScan(raw.json() as Record<string, unknown>);

      expect(client.id).toBe(scanId);
      expect(client.status).toBe('completed');
      expect(client.networkIssues.length).toBeGreaterThan(0);
      expect(client.networkIssues.some((n) => n.url.includes('/api/fail'))).toBe(true);
      expect(client.summary.networkCount).toBeGreaterThan(0);
    }, 90_000);

    it('cancels an in-flight scan via POST /api/scans/:id/cancel', async () => {
      const scanId = await createScan(app, fixtureUrl, {
        maxPages: 20,
        maxDepth: 3,
        timeout: 15_000,
        interactions: true,
      });

      await new Promise((r) => setTimeout(r, 300));
      const cancelRes = await app.inject({ method: 'POST', url: `/api/scans/${scanId}/cancel` });
      expect(cancelRes.statusCode).toBe(200);

      const status = await waitForScanStatus(app, scanId, 90_000);
      expect(status.status).toBe('cancelled');
    }, 120_000);

    it('handles per-page timeout without fabricating results', async () => {
      const scanId = await createScan(app, `${fixtureUrl}/hang`, {
        maxPages: 1,
        timeout: 1000,
        performance: false,
        accessibility: false,
        security: false,
      });
      const status = await waitForScanStatus(app, scanId, 60_000);
      expect(['completed', 'completed_with_warnings', 'failed']).toContain(status.status);
      const result = await fetchScanResults(app, scanId);
      expect(result.pages.length).toBeGreaterThanOrEqual(1);
      const hadTimeout =
        result.runtimeErrors.some((e) => /timeout/i.test(e.message)) ||
        result.pages.some((p) => p.status === 'error');
      expect(hadTimeout || status.status === 'completed_with_warnings').toBe(true);
    }, 90_000);

    it('runs two concurrent fixture scans without cross-contamination', async () => {
      const [idA, idB] = await Promise.all([
        createScan(app, `${fixtureUrl}/console`, { maxPages: 1, timeout: 10_000, accessibility: false, security: false }),
        createScan(app, `${fixtureUrl}/network`, { maxPages: 1, timeout: 10_000, accessibility: false, security: false }),
      ]);

      const [statusA, statusB] = await Promise.all([
        waitForScanStatus(app, idA, 90_000),
        waitForScanStatus(app, idB, 90_000),
      ]);
      expect(['completed', 'completed_with_warnings']).toContain(statusA.status);
      expect(['completed', 'completed_with_warnings']).toContain(statusB.status);

      const [resultA, resultB] = await Promise.all([
        fetchScanResults(app, idA),
        fetchScanResults(app, idB),
      ]);
      expect(resultA.consoleEvents.length).toBeGreaterThan(0);
      expect(resultB.networkFailures.some((e) => e.url.includes('/api/fail'))).toBe(true);
      expect(resultA.scan.id).not.toBe(resultB.scan.id);
    }, 120_000);
  });

  describe('SSRF and redirect protection (API layer)', () => {
    const blocked = [
      'http://127.0.0.1/',
      'http://localhost/',
      'http://10.0.0.1/',
      'http://192.168.1.1/',
      'http://172.16.0.1/',
      'http://169.254.169.254/',
      'http://[::1]/',
      'file:///etc/passwd',
      'http://metadata.google.internal/',
    ];

    beforeAll(() => {
      process.env.ALLOW_LOCAL_TARGETS = 'false';
    });

    for (const url of blocked) {
      it(`rejects SSRF target ${url}`, async () => {
        const res = await app.inject({ method: 'POST', url: '/api/scans', payload: { url } });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBeTruthy();
      });
    }
  });
});
