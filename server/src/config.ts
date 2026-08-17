import fs from 'node:fs';
import path from 'node:path';
import { parseCorsOrigins } from './security/cors.ts';

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

const nodeEnv = process.env.NODE_ENV ?? 'development';

export function assertProductionEnv(): void {
  if (nodeEnv !== 'production') return;
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in production');
  }
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is required in production');
  }
}

function databaseSsl(): boolean | { rejectUnauthorized: boolean } | undefined {
  if (bool('DATABASE_SSL', false)) {
    return { rejectUnauthorized: bool('DATABASE_SSL_REJECT_UNAUTHORIZED', true) };
  }
  const url = process.env.DATABASE_URL ?? '';
  if (url.includes('sslmode=require') || url.includes('sslmode=verify')) {
    return { rejectUnauthorized: bool('DATABASE_SSL_REJECT_UNAUTHORIZED', true) };
  }
  return undefined;
}

export const config = {
  nodeEnv,
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://trace:trace@localhost:5432/trace',
  databaseSsl: databaseSsl(),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  // Render injects PORT at runtime; local compose may set API_PORT instead.
  apiPort: num('PORT', num('API_PORT', 3001)),
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3001',
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS, nodeEnv),
  allowLocalTargets: bool('ALLOW_LOCAL_TARGETS', false),
  scanMaxPages: num('SCAN_MAX_PAGES', 5),
  scanHardMaxPages: num('SCAN_HARD_MAX_PAGES', 10),
  scanMaxDepth: num('SCAN_MAX_DEPTH', 1),
  scanMaxDurationMs: num('SCAN_MAX_DURATION', 180_000),
  scanPageTimeoutMs: num('SCAN_PAGE_TIMEOUT', 30_000),
  scanMaxRequests: num('SCAN_MAX_REQUESTS', 100),
  scanMaxConsoleEvents: num('SCAN_MAX_CONSOLE_EVENTS', 200),
  scanMaxRuntimeErrors: num('SCAN_MAX_RUNTIME_ERRORS', 100),
  browserConcurrency: num('SCAN_BROWSER_CONCURRENCY', 1),
  scanScreenshotsEnabled: bool('SCAN_SCREENSHOTS_ENABLED', false),
  maxScreenshotBytes: num('SCAN_MAX_SCREENSHOT_BYTES', 512_000),
  maxResponseBodyBytes: num('SCAN_MAX_RESPONSE_BODY_BYTES', 32_768),
  probeMaxRequests: num('SCAN_PROBE_MAX_REQUESTS', 20),
  artifactDir: process.env.ARTIFACT_DIR ?? path.resolve(process.cwd(), 'artifacts'),
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
