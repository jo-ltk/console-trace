#!/usr/bin/env npx tsx
/**
 * Production-like Docker smoke test.
 * Requires: docker compose up (api, worker, postgres, redis)
 *
 * Flow: POST /api/scans → BullMQ → Worker → Playwright → PostgreSQL → GET results
 */
const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3001';
const SCAN_URL = process.env.SMOKE_SCAN_URL ?? 'https://example.com';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 120_000);

interface ScanCreate {
  scanId: string;
  status: string;
}

interface ScanStatus {
  status: string;
  statusReason?: string;
}

interface ScanResult {
  scan: { id: string; url: string; status: string; durationMs: number };
  summary: {
    pagesScanned: number;
    pagesDiscovered: number;
    requestsObserved: number;
    consoleEvents: number;
    runtimeErrors: number;
    networkFailures: number;
  };
  scores: { overall: number };
  pages: unknown[];
  consoleEvents: unknown[];
  networkEvents: unknown[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`API health check failed at ${API_BASE}/health`);
}

async function waitForScan(scanId: string): Promise<ScanStatus> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const st = await request<ScanStatus>(`/api/scans/${scanId}/status`);
    if (['completed', 'completed_with_warnings', 'failed', 'cancelled'].includes(st.status)) {
      return st;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Scan ${scanId} did not complete within ${TIMEOUT_MS}ms`);
}

async function main() {
  console.log('DOCKER SMOKE TEST');
  console.log(`API: ${API_BASE}`);
  console.log(`Target: ${SCAN_URL}`);
  console.log('');

  await waitForHealth();
  console.log('[ok] API health');

  const created = await request<ScanCreate>('/api/scans', {
    method: 'POST',
    body: JSON.stringify({
      url: SCAN_URL,
      options: {
        maxPages: 3,
        maxDepth: 1,
        timeout: 30_000,
        device: 'mobile',
        accessibility: true,
        performance: true,
        security: true,
        interactions: false,
      },
    }),
  });
  console.log(`[ok] scan queued: ${created.scanId}`);

  const status = await waitForScan(created.scanId);
  console.log(`[ok] scan status: ${status.status}`);

  if (status.status === 'failed') {
    throw new Error(`Scan failed: ${status.statusReason ?? 'unknown'}`);
  }
  if (status.status === 'cancelled') {
    throw new Error('Scan was cancelled unexpectedly');
  }

  const result = await request<ScanResult>(`/api/scans/${created.scanId}/results`);
  if (!result.scan?.id) {
    throw new Error('Results missing scan metadata — not observed');
  }

  console.log('');
  console.log('RESULTS (observed)');
  console.log(`  pages:     ${result.summary.pagesScanned}`);
  console.log(`  requests:  ${result.summary.requestsObserved}`);
  console.log(`  console:   ${result.summary.consoleEvents}`);
  console.log(`  runtime:   ${result.summary.runtimeErrors}`);
  console.log(`  network:   ${result.summary.networkFailures}`);
  console.log(`  health:    ${result.scores.overall} / 100`);
  console.log(`  duration:  ${result.scan.durationMs}ms`);

  if (result.summary.pagesScanned < 1) {
    throw new Error('No pages scanned — smoke test failed');
  }
  if (result.summary.requestsObserved < 1) {
    throw new Error('No network requests observed — smoke test failed');
  }
  if (!Array.isArray(result.pages) || result.pages.length < 1) {
    throw new Error('Pages array empty — smoke test failed');
  }

  console.log('');
  console.log('DOCKER SMOKE TEST PASSED');
  console.log(`Observed ${result.summary.requestsObserved} network/API requests during this scan.`);
}

main().catch((err) => {
  console.error('DOCKER SMOKE TEST FAILED');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
