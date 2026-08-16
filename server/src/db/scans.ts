import type { ScanOptions, ScanResult, ScanStatus } from '../../../src/server/types/scan-types.ts';
import { pool } from './pool.ts';
import { log } from '../log.ts';

export async function insertScan(row: {
  id: string;
  url: string;
  normalizedUrl: string;
  status: ScanStatus;
  options: ScanOptions;
}): Promise<void> {
  await pool.query(
    `INSERT INTO scans (id, url, normalized_url, status, options) VALUES ($1,$2,$3,$4,$5)`,
    [row.id, row.url, row.normalizedUrl, row.status, JSON.stringify(row.options)],
  );
}

export async function updateScanStatus(
  id: string,
  status: ScanStatus,
  extra?: { reason?: string; startedAt?: Date },
): Promise<void> {
  await pool.query(
    `UPDATE scans SET status = $2, status_reason = COALESCE($3, status_reason), started_at = COALESCE($4, started_at), updated_at = now() WHERE id = $1`,
    [id, status, extra?.reason ?? null, extra?.startedAt ?? null],
  );
}

export async function completeScan(id: string, result: ScanResult): Promise<void> {
  await pool.query(
    `UPDATE scans SET
      status = $2,
      status_reason = $3,
      result = $4,
      scores = $5,
      summary = $6,
      completed_at = $7,
      duration_ms = $8,
      updated_at = now()
     WHERE id = $1`,
    [
      id,
      result.scan.status,
      result.scan.statusReason ?? null,
      JSON.stringify(result),
      JSON.stringify(result.scores),
      JSON.stringify(result.summary),
      result.scan.completedAt ?? new Date().toISOString(),
      result.scan.durationMs,
    ],
  );

  await persistChildren(id, result);
}

export async function failScan(id: string, message: string): Promise<void> {
  await pool.query(
    `UPDATE scans SET status = 'failed', error_message = $2, completed_at = now(), updated_at = now() WHERE id = $1`,
    [id, message],
  );
}

export async function getScan(id: string) {
  const r = await pool.query('SELECT * FROM scans WHERE id = $1', [id]);
  return r.rows[0] ?? null;
}

export async function listScans(limit = 50) {
  const r = await pool.query('SELECT * FROM scans ORDER BY created_at DESC LIMIT $1', [limit]);
  return r.rows;
}

async function persistChildren(scanId: string, result: ScanResult) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of result.pages) {
      await client.query(
        `INSERT INTO scan_pages (id, scan_id, url, title, status, status_code, issues_count, duration_ms, depth)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [p.id, scanId, p.url, p.title, p.status, p.statusCode, p.issuesCount, p.duration, p.depth],
      );
    }
    for (const e of result.consoleEvents) {
      await client.query(
        `INSERT INTO console_events (scan_id, type, text, page_url, timestamp, source_url, line, col, args, classification, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [scanId, e.type, e.text, e.pageUrl, e.timestamp, e.sourceUrl ?? null, e.line ?? null, e.column ?? null, JSON.stringify(e.args ?? []), e.classification, e.source],
      );
    }
    for (const e of result.runtimeErrors) {
      await client.query(
        `INSERT INTO runtime_errors (scan_id, message, stack, page_url, timestamp, source_url, line, col, type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [scanId, e.message, e.stack ?? null, e.pageUrl, e.timestamp, e.sourceUrl ?? null, e.line ?? null, e.column ?? null, e.type],
      );
    }
    for (const e of result.networkEvents.slice(0, 2000)) {
      await client.query(
        `INSERT INTO network_events (scan_id, url, method, resource_type, status, request_headers, response_headers, response_size, duration_ms, page_url, initiator, failure_reason, is_api)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [scanId, e.url, e.method, e.resourceType, e.status, JSON.stringify(e.requestHeaders), JSON.stringify(e.responseHeaders), e.responseSize ?? null, e.duration, e.pageUrl, e.initiator ?? null, e.failureReason ?? null, e.isApi],
      );
    }
    for (const e of result.networkFailures) {
      await client.query(
        `INSERT INTO network_failures (scan_id, url, method, status, reason, page_url, resource_type, duration_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [scanId, e.url, e.method, e.status, e.reason, e.pageUrl, e.resourceType, e.duration],
      );
    }
    await client.query(`INSERT INTO performance_metrics (scan_id, metrics) VALUES ($1,$2)`, [scanId, JSON.stringify(result.performance)]);
    for (const f of result.accessibility) {
      await client.query(
        `INSERT INTO accessibility_findings (scan_id, rule, impact, element_html, selector, page_url, description, help_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [scanId, f.rule, f.impact, f.elementHtml, f.selector, f.pageUrl, f.description, f.helpUrl],
      );
    }
    for (const f of result.securityFindings) {
      await client.query(
        `INSERT INTO security_findings (scan_id, category, name, severity, status, evidence)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [scanId, f.category, f.name, f.severity, f.status, f.evidence],
      );
    }
    for (const f of result.seoFindings) {
      await client.query(`INSERT INTO seo_findings (scan_id, page_url, payload) VALUES ($1,$2,$3)`, [scanId, f.pageUrl, JSON.stringify(f)]);
    }
    for (const f of result.brokenResources) {
      await client.query(
        `INSERT INTO asset_findings (scan_id, url, page_url, resource_type, status, error) VALUES ($1,$2,$3,$4,$5,$6)`,
        [scanId, f.url, f.pageUrl, f.resourceType, f.status, f.error ?? null],
      );
    }
    for (const i of result.issues) {
      await client.query(
        `INSERT INTO issues (scan_id, type, category, severity, title, description, occurrences, pages, evidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [scanId, i.type, i.category, i.severity, i.title, i.description, i.occurrences, JSON.stringify(i.pages), JSON.stringify(i.evidence)],
      );
    }
    const pageIds = new Set(result.pages.map((p) => p.id));
    for (const f of result.findings ?? []) {
      const pageId = f.pageId && pageIds.has(f.pageId) ? f.pageId : null;
      await client.query(
        `INSERT INTO findings (
           id, scan_id, page_id, category, severity, title, summary, description,
           evidence_json, recommendation, confidence, occurrences, dedupe_key,
           first_observed_at, last_observed_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          f.id,
          scanId,
          pageId,
          f.category,
          f.severity,
          f.title,
          f.summary,
          f.description,
          JSON.stringify(f.evidence),
          f.recommendation,
          f.confidence,
          f.occurrences,
          f.dedupeKey,
          f.firstObservedAt || null,
          f.lastObservedAt || null,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    log.error('persist_children_failed', { scanId, error: (err as Error).message });
    throw err;
  } finally {
    client.release();
  }
}

export async function insertArtifact(scanId: string, kind: string, filePath: string, contentType: string) {
  await pool.query(
    `INSERT INTO scan_artifacts (scan_id, kind, path, content_type) VALUES ($1,$2,$3,$4)`,
    [scanId, kind, filePath, contentType],
  );
}

export async function listArtifacts(scanId: string) {
  const r = await pool.query('SELECT * FROM scan_artifacts WHERE scan_id = $1', [scanId]);
  return r.rows;
}
