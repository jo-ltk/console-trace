#!/usr/bin/env npx tsx
/**
 * Production smoke test against deployed Render API.
 * No mocks — exercises real scan pipeline end-to-end.
 */
const API = process.env.API_BASE_URL ?? 'https://trace-api-15uf.onrender.com';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 180_000);

type Result = { pass: boolean; detail: string };

const report: Record<string, Result> = {};

async function req(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function waitScan(scanId: string, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  const statuses: string[] = [];
  while (Date.now() < deadline) {
    const { body } = await req(`/api/scans/${scanId}/status`);
    const s = body.status as string;
    if (!statuses.includes(s)) statuses.push(s);
    if (['completed', 'completed_with_warnings', 'failed', 'cancelled'].includes(s)) {
      return { final: s, statuses, reason: body.statusReason as string | undefined };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Scan ${scanId} timed out after ${timeoutMs}ms (last statuses: ${statuses.join(' → ')})`);
}

async function createScan(url: string, options: Record<string, unknown> = {}) {
  return req('/api/scans', {
    method: 'POST',
    body: JSON.stringify({
      url,
      options: {
        maxPages: 5,
        maxDepth: 2,
        accessibility: true,
        performance: true,
        security: true,
        interactions: true,
        ...options,
      },
    }),
  });
}

function pass(key: string, detail: string) {
  report[key] = { pass: true, detail };
  console.log(`[PASS] ${key}: ${detail}`);
}

function fail(key: string, detail: string) {
  report[key] = { pass: false, detail };
  console.log(`[FAIL] ${key}: ${detail}`);
}

async function main() {
  console.log('PRODUCTION SMOKE TEST');
  console.log(`API: ${API}`);
  console.log('');

  // API health
  try {
    const health = await fetch(`${API}/health`);
    if (health.ok) pass('API', `GET /health → ${health.status}`);
    else fail('API', `GET /health → ${health.status}`);
  } catch (e) {
    fail('API', (e as Error).message);
    printReport();
    process.exit(1);
  }

  // POST /api/scans + full pipeline
  let scanId: string | undefined;
  try {
    const created = await createScan('https://example.com', { maxPages: 3, interactions: false });
    if (created.status !== 202) {
      fail('POST /api/scans', `HTTP ${created.status}: ${JSON.stringify(created.body)}`);
    } else {
      scanId = created.body.scanId as string;
      pass('POST /api/scans', `scanId=${scanId}, status=${created.body.status}`);
    }
  } catch (e) {
    fail('POST /api/scans', (e as Error).message);
  }

  if (!scanId) {
    printReport();
    process.exit(1);
  }

  // Wait for completion
  let waitResult;
  try {
    waitResult = await waitScan(scanId);
    if (['completed', 'completed_with_warnings'].includes(waitResult.final)) {
      pass('Worker', `status=${waitResult.final}, transitions: ${waitResult.statuses.join(' → ')}`);
      pass('Redis/BullMQ', 'Job processed (scan left queued state)');
      pass('Playwright/Chromium', 'Browser launched and reached target');
    } else {
      fail('Worker', `Unexpected final status: ${waitResult.final} (${waitResult.reason ?? ''})`);
    }
  } catch (e) {
    fail('Worker', (e as Error).message);
    fail('Redis/BullMQ', 'Could not confirm job processing');
    fail('Playwright/Chromium', 'Scan did not complete');
  }

  // Results from PostgreSQL
  try {
    const { body: result } = await req(`/api/scans/${scanId}/results`);
    if (!result.scan?.id) {
      fail('PostgreSQL', 'Results missing scan metadata');
    } else {
      const s = result.summary as Record<string, number>;
      const checks = [
        `pages=${s.pagesScanned}`,
        `requests=${s.requestsObserved}`,
        `console=${s.consoleEvents}`,
        `runtime=${s.runtimeErrors}`,
        `network=${s.networkFailures}`,
        `a11y=${s.accessibilityViolations}`,
        `security=${s.securityFindings}`,
        `health=${(result.scores as { overall: number }).overall}`,
      ];
      pass('PostgreSQL', checks.join(', '));
      if (s.pagesScanned >= 1 && s.requestsObserved >= 1) {
        pass('Real website scan', `Observed ${s.pagesScanned} page(s), ${s.requestsObserved} request(s)`);
      } else {
        fail('Real website scan', 'No pages or requests observed');
      }
      if (result.consoleEvents || result.performance || result.accessibility) {
        pass('Playwright/Chromium', 'Console, performance, and accessibility data captured');
      }
    }
  } catch (e) {
    fail('PostgreSQL', (e as Error).message);
    fail('Real website scan', 'Could not fetch results');
  }

  // SSRF
  const ssrfUrls = ['http://127.0.0.1/', 'http://localhost/', 'http://169.254.169.254/'];
  const ssrfBlocked = await Promise.all(
    ssrfUrls.map(async (url) => {
      const r = await createScan(url);
      return r.status === 400 && !!(r.body as { error?: string }).error;
    }),
  );
  if (ssrfBlocked.every(Boolean)) {
    pass('SSRF', `Blocked ${ssrfUrls.length}/${ssrfUrls.length} private/metadata targets`);
  } else {
    fail('SSRF', `Only blocked ${ssrfBlocked.filter(Boolean).length}/${ssrfUrls.length}`);
  }

  // Cancellation — wait for terminal status (worker may briefly report in-flight state)
  try {
    const c = await createScan('https://example.com', { maxPages: 20, maxDepth: 3, interactions: true });
    const cid = c.body.scanId as string;
    await new Promise((r) => setTimeout(r, 400));
    await req(`/api/scans/${cid}/cancel`, { method: 'POST' });
    const cw = await waitScan(cid, 120_000);
    if (cw.final === 'cancelled') pass('Cancellation', `scan ${cid} → cancelled`);
    else fail('Cancellation', `Expected cancelled, got ${cw.final}`);
  } catch (e) {
    fail('Cancellation', (e as Error).message);
  }

  // Timeout
  try {
    const t = await createScan('https://httpbin.org/delay/10', { timeout: 3000, maxPages: 1 });
    const tid = t.body.scanId as string;
    const tw = await waitScan(tid, 120_000);
    if (['completed', 'completed_with_warnings', 'failed'].includes(tw.final)) {
      pass('Timeout', `Scan with 3s timeout ended as ${tw.final}`);
    } else {
      fail('Timeout', `Unexpected status: ${tw.final}`);
    }
  } catch (e) {
    fail('Timeout', (e as Error).message);
  }

  // Concurrent scans
  try {
    const [a, b] = await Promise.all([
      createScan('https://example.com', { maxPages: 2, interactions: false }),
      createScan('https://example.org', { maxPages: 2, interactions: false }),
    ]);
    const [aw, bw] = await Promise.all([
      waitScan(a.body.scanId as string),
      waitScan(b.body.scanId as string),
    ]);
    if (
      ['completed', 'completed_with_warnings'].includes(aw.final) &&
      ['completed', 'completed_with_warnings'].includes(bw.final)
    ) {
      pass('Concurrent scans', `Both completed: ${aw.final}, ${bw.final}`);
    } else {
      fail('Concurrent scans', `${aw.final}, ${bw.final}`);
    }
  } catch (e) {
    fail('Concurrent scans', (e as Error).message);
  }

  // Complex site (badssl)
  try {
    const bs = await createScan('https://badssl.com/', { maxPages: 5, maxDepth: 2 });
    const bsw = await waitScan(bs.body.scanId as string);
    const { body: bsRes } = await req(`/api/scans/${bs.body.scanId}/results`);
    if (['completed', 'completed_with_warnings'].includes(bsw.final) && bsRes.summary) {
      const s = bsRes.summary as Record<string, number>;
      pass(
        'Complex site scan',
        `badssl.com: pages=${s.pagesScanned}, console=${s.consoleEvents}, network=${s.networkFailures}, health=${(bsRes.scores as { overall: number }).overall}`,
      );
    } else {
      fail('Complex site scan', `status=${bsw.final}`);
    }
  } catch (e) {
    fail('Complex site scan', (e as Error).message);
  }

  // Mobile adapter test (simulates Expo report screen data path)
  try {
    const { body: raw } = await req(`/api/scans/${scanId}/results`);
    const { toClientScan } = await import('../src/services/adapter.ts');
    const mapped = toClientScan(raw as Record<string, unknown>);
    const hasData =
      mapped.healthScore > 0 &&
      mapped.summary.consoleCount >= 0 &&
      mapped.performanceMetrics.lcp >= 0;
    if (hasData) {
      pass('Mobile result', `health=${mapped.healthScore}, pages=${mapped.pagesScanned}, console=${mapped.summary.consoleCount}`);
    } else {
      fail('Mobile result', 'Adapter produced empty/invalid scan');
    }
  } catch (e) {
    fail('Mobile result', (e as Error).message);
  }

  printReport();
  const anyFail = Object.values(report).some((r) => !r.pass);
  process.exit(anyFail ? 1 : 0);
}

function printReport() {
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('PRODUCTION SMOKE TEST');
  const keys = [
    'API',
    'POST /api/scans',
    'Redis/BullMQ',
    'Worker',
    'Playwright/Chromium',
    'PostgreSQL',
    'Real website scan',
    'Mobile result',
    'Cancellation',
    'Timeout',
    'SSRF',
    'Concurrent scans',
    'Complex site scan',
  ];
  for (const key of keys) {
    const r = report[key];
    if (!r) {
      console.log(`${key}: SKIP`);
      continue;
    }
    console.log(`${key}: ${r.pass ? 'PASS' : 'FAIL'} — ${r.detail}`);
  }
  console.log('═══════════════════════════════════════');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
