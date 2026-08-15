import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://trace:trace@localhost:5432/trace',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  apiPort: num('API_PORT', 3001),
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3001',
  allowLocalTargets: bool('ALLOW_LOCAL_TARGETS', false),
  scanMaxPages: num('SCAN_MAX_PAGES', 20),
  scanHardMaxPages: num('SCAN_HARD_MAX_PAGES', 100),
  scanMaxDepth: num('SCAN_MAX_DEPTH', 3),
  scanMaxDurationMs: num('SCAN_MAX_DURATION', 180_000),
  scanPageTimeoutMs: num('SCAN_PAGE_TIMEOUT', 30_000),
  scanMaxRequests: num('SCAN_MAX_REQUESTS', 500),
  browserConcurrency: num('SCAN_BROWSER_CONCURRENCY', 1),
  maxScreenshotBytes: num('SCAN_MAX_SCREENSHOT_BYTES', 8_000_000),
  maxResponseBodyBytes: num('SCAN_MAX_RESPONSE_BODY_BYTES', 1_048_576),
  probeMaxRequests: num('SCAN_PROBE_MAX_REQUESTS', 50),
  artifactDir: process.env.ARTIFACT_DIR ?? path.resolve(process.cwd(), 'artifacts'),
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
