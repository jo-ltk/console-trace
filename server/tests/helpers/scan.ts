import type { FastifyInstance } from 'fastify';
import type { ScanResult } from '../../../src/server/types/scan-types.ts';

const TERMINAL = new Set(['completed', 'completed_with_warnings', 'failed', 'cancelled']);

export async function waitForScanStatus(
  app: FastifyInstance,
  scanId: string,
  timeoutMs = 120_000,
): Promise<{ status: string; statusReason?: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await app.inject({ method: 'GET', url: `/api/scans/${scanId}/status` });
    if (res.statusCode !== 200) {
      throw new Error(`status poll failed: ${res.statusCode} ${res.body}`);
    }
    const body = res.json() as { status: string; statusReason?: string };
    if (TERMINAL.has(body.status)) return body;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Scan ${scanId} did not finish within ${timeoutMs}ms`);
}

export async function createScan(
  app: FastifyInstance,
  url: string,
  options: Record<string, unknown> = {},
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/scans',
    payload: { url, options },
  });
  if (res.statusCode !== 202) {
    throw new Error(`create scan failed: ${res.statusCode} ${res.body}`);
  }
  const body = res.json() as { scanId: string };
  return body.scanId;
}

export async function fetchScanResults(app: FastifyInstance, scanId: string): Promise<ScanResult> {
  const res = await app.inject({ method: 'GET', url: `/api/scans/${scanId}/results` });
  if (res.statusCode !== 200) {
    throw new Error(`results failed: ${res.statusCode} ${res.body}`);
  }
  const body = res.json() as ScanResult & { result?: ScanResult };
  if (body.scan) return body;
  if (body.result) return body.result;
  throw new Error('results payload missing scan');
}
