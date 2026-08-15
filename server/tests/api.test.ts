import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/api/index.ts';
import { migrate, pool } from '../src/db/pool.ts';
import type { FastifyInstance } from 'fastify';

const hasDb = Boolean(process.env.DATABASE_URL || process.env.RUN_API_TESTS === '1');

describe.skipIf(!hasDb && process.env.CI !== '1')('scan API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.ALLOW_LOCAL_TARGETS = 'false';
    await migrate();
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
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
});
