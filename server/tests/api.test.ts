import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/api/index.ts';
import { migrate } from '../src/db/pool.ts';
import { applyIntegrationEnv, servicesAvailable } from './helpers/services.ts';

const servicesUp = await servicesAvailable();

describe.skipIf(!servicesUp)('scan API (validation)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    applyIntegrationEnv();
    process.env.ALLOW_LOCAL_TARGETS = 'false';
    await migrate();
    app = await buildApp({ disableRateLimit: true });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects invalid url', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/scans', payload: { url: '' } });
    expect(res.statusCode).toBe(400);
  });

  it('rejects private url', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/scans',
      payload: { url: 'http://127.0.0.1/' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/not allowed|Localhost|private/i);
  });

  it('rejects missing scan', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/scans/00000000-0000-0000-0000-000000000000/status' });
    expect(res.statusCode).toBe(404);
  });

  it('serves /health with database, redis, and worker status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.database).toBe(true);
    expect(body.redis).toBe(true);
    expect(body.checks.database).toBe('up');
    expect(body.checks.redis).toBe('up');
    expect(['ok', 'missing']).toContain(body.worker);
    expect(body.checks.worker).toBe(body.worker);
  });

  it('serves / so the public API origin is not Not Found', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.json().health).toBe('/health');
  });
});
