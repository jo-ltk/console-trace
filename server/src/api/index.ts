import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { config } from '../config.ts';
import { log } from '../log.ts';
import { snapshotMetrics } from '../metrics.ts';
import { migrate, pool } from '../db/pool.ts';
import { getScan, insertScan, listScans, updateScanStatus } from '../db/scans.ts';
import { enqueueScan, requestCancel, getRedis } from '../queue/queues.ts';
import { assertSafeUrl, SsrfError } from '../security/ssrf.ts';
import type { ScanResult } from '../../../src/server/types/scan-types.ts';

const ScanBody = z.object({
  url: z.string().min(1),
  options: z
    .object({
      maxPages: z.number().int().min(1).max(100).optional(),
      maxDepth: z.number().int().min(0).max(10).optional(),
      timeout: z.number().int().min(1000).max(120000).optional(),
      device: z.enum(['mobile', 'desktop']).optional(),
      interactions: z.boolean().optional(),
      accessibility: z.boolean().optional(),
      performance: z.boolean().optional(),
      security: z.boolean().optional(),
      activeProbing: z.boolean().optional(),
    })
    .optional(),
});

function resultOf(row: { result: ScanResult | string | null; id: string; status: string }): ScanResult | null {
  if (!row.result) return null;
  return typeof row.result === 'string' ? (JSON.parse(row.result) as ScanResult) : (row.result as ScanResult);
}

export async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.get('/health', async () => ({ ok: true, metrics: snapshotMetrics() }));

  app.post(
    '/api/scans',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const parsed = ScanBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid request', details: parsed.error.issues });
      }
      try {
        const normalized = await assertSafeUrl(parsed.data.url);
        const scanId = randomUUID();
        const options = parsed.data.options ?? {};
        await insertScan({
          id: scanId,
          url: parsed.data.url,
          normalizedUrl: normalized,
          status: 'queued',
          options,
        });
        await enqueueScan(scanId, normalized, options);
        log.info('scan_queued', { scanId, pageUrl: normalized });
        return reply.code(202).send({ scanId, status: 'queued' });
      } catch (err) {
        if (err instanceof SsrfError) {
          return reply.code(400).send({ error: err.message });
        }
        log.error('scan_create_failed', { error: (err as Error).message });
        return reply.code(500).send({ error: 'Failed to create scan' });
      }
    },
  );

  app.get('/api/scans', async () => {
    const rows = await listScans();
    return rows.map((r) => ({
      scanId: r.id,
      url: r.url,
      status: r.status,
      createdAt: r.created_at,
      scores: r.scores,
      summary: r.summary,
    }));
  });

  app.get('/api/scans/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await getScan(id);
    if (!row) return reply.code(404).send({ error: 'Scan not found' });
    return {
      scanId: row.id,
      url: row.url,
      normalizedUrl: row.normalized_url,
      status: row.status,
      statusReason: row.status_reason,
      options: row.options,
      summary: row.summary,
      scores: row.scores,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationMs: row.duration_ms,
      errorMessage: row.error_message,
    };
  });

  app.get('/api/scans/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await getScan(id);
    if (!row) return reply.code(404).send({ error: 'Scan not found' });
    return { scanId: row.id, status: row.status, statusReason: row.status_reason };
  });

  const slice = async (req: { params: unknown }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }, key: keyof ScanResult) => {
    const { id } = req.params as { id: string };
    const row = await getScan(id);
    if (!row) return reply.code(404).send({ error: 'Scan not found' });
    const result = resultOf(row);
    if (!result) return { status: row.status, data: null, note: 'NOT OBSERVED yet' };
    return result[key];
  };

  app.get('/api/scans/:id/results', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await getScan(id);
    if (!row) return reply.code(404).send({ error: 'Scan not found' });
    const result = resultOf(row);
    if (!result) return { scanId: id, status: row.status, result: null };
    return result;
  });
  app.get('/api/scans/:id/issues', (req, reply) => slice(req, reply, 'issues'));
  app.get('/api/scans/:id/pages', (req, reply) => slice(req, reply, 'pages'));
  app.get('/api/scans/:id/network', (req, reply) => slice(req, reply, 'networkEvents'));
  app.get('/api/scans/:id/console', (req, reply) => slice(req, reply, 'consoleEvents'));
  app.get('/api/scans/:id/performance', (req, reply) => slice(req, reply, 'performance'));
  app.get('/api/scans/:id/security', (req, reply) => slice(req, reply, 'securityFindings'));
  app.get('/api/scans/:id/accessibility', (req, reply) => slice(req, reply, 'accessibility'));

  app.get(
    '/api/scans/:id/export',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const row = await getScan(id);
      if (!row) return reply.code(404).send({ error: 'Scan not found' });
      const result = resultOf(row);
      if (!result) return reply.code(409).send({ error: 'Scan not complete' });
      return result;
    },
  );

  app.post('/api/scans/:id/cancel', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await getScan(id);
    if (!row) return reply.code(404).send({ error: 'Scan not found' });
    await requestCancel(id);
    await updateScanStatus(id, 'cancelled', { reason: 'Cancelled by client' });
    return { success: true, status: 'cancelled' };
  });

  app.get('/api/scans/:id/events', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await getScan(id);
    if (!row) return reply.code(404).send({ error: 'Scan not found' });
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = (data: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    send({ status: row.status });
    const sub = getRedis().duplicate();
    await sub.subscribe(`scan:${id}:progress`);
    sub.on('message', (_ch, message) => send(JSON.parse(message)));
    const iv = setInterval(async () => {
      const latest = await getScan(id);
      if (!latest) return;
      send({ status: latest.status });
      if (['completed', 'completed_with_warnings', 'failed', 'cancelled'].includes(latest.status)) {
        clearInterval(iv);
        await sub.quit();
        reply.raw.end();
      }
    }, 1000);
    req.raw.on('close', async () => {
      clearInterval(iv);
      await sub.quit().catch(() => undefined);
    });
  });

  return app;
}

export async function startApi() {
  await migrate();
  const app = await buildApp();
  await app.listen({ port: config.apiPort, host: '0.0.0.0' });
  log.info('api_listening', { port: config.apiPort });
  return app;
}

const launchedAsApi =
  typeof process.argv[1] === 'string' && /(?:^|[\\/])api[\\/]index\.[cm]?ts$/.test(process.argv[1]);

if (launchedAsApi) {
  startApi().catch((err) => {
    log.error('api_start_failed', { error: err.message });
    process.exit(1);
  });
}

export { pool };
