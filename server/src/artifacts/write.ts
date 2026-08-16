import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.ts';
import { insertArtifact } from '../db/scans.ts';
import type { ScanResult } from '../../../src/server/types/scan-types.ts';

export interface ArtifactPaths {
  dir: string;
  jsonPath: string;
  htmlPath: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(result: ScanResult): string {
  const s = result.summary;
  const scores = result.scores;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>TRACE Report — ${escapeHtml(result.scan.url)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
    h1 { font-size: 1.25rem; }
    .meta { color: #555; margin-bottom: 1.5rem; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; font-size: 0.875rem; }
    th { background: #f5f5f5; }
    .score { font-size: 2rem; font-weight: 700; }
  </style>
</head>
<body>
  <h1>TRACE observation report</h1>
  <p class="meta">
    Target: ${escapeHtml(result.scan.url)}<br>
    Status: ${escapeHtml(result.scan.status)}<br>
    Duration: ${result.scan.durationMs}ms<br>
    Observed ${s.requestsObserved} network/API requests during this scan.
  </p>
  <p class="score">Health: ${scores.overall} / 100</p>
  <table>
    <tr><th>Metric</th><th>Count</th></tr>
    <tr><td>Pages scanned</td><td>${s.pagesScanned}</td></tr>
    <tr><td>Console events</td><td>${s.consoleEvents}</td></tr>
    <tr><td>Runtime errors</td><td>${s.runtimeErrors}</td></tr>
    <tr><td>Network failures</td><td>${s.networkFailures}</td></tr>
    <tr><td>Accessibility violations</td><td>${s.accessibilityViolations}</td></tr>
    <tr><td>Broken assets</td><td>${s.brokenAssets}</td></tr>
  </table>
  <p><small>Generated from observed browser data. Values not observed are marked NOT AVAILABLE in the JSON export.</small></p>
</body>
</html>`;
}

export async function writeArtifacts(
  scanId: string,
  result: ScanResult,
  opts: { persistDb?: boolean } = {},
): Promise<ArtifactPaths> {
  const persistDb = opts.persistDb !== false;
  const dir = path.join(config.artifactDir, scanId);
  await fs.mkdir(dir, { recursive: true });

  const jsonPath = path.join(dir, 'report.json');
  const htmlPath = path.join(dir, 'report.html');

  await fs.writeFile(jsonPath, JSON.stringify(result, null, 2), 'utf8');
  await fs.writeFile(htmlPath, renderHtml(result), 'utf8');

  if (persistDb) {
    await insertArtifact(scanId, 'report_json', jsonPath, 'application/json');
    await insertArtifact(scanId, 'report_html', htmlPath, 'text/html');
    if (result.screenshots.homepage) {
      await insertArtifact(scanId, 'screenshot_homepage', result.screenshots.homepage, 'image/png');
    }
    if (result.screenshots.viewport) {
      await insertArtifact(scanId, 'screenshot_viewport', result.screenshots.viewport, 'image/png');
    }
  }

  return { dir, jsonPath, htmlPath };
}
