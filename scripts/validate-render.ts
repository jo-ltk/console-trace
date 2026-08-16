#!/usr/bin/env npx tsx
/**
 * Validate render.yaml for split API + persistent Playwright worker.
 */
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'render.yaml');
const text = fs.readFileSync(file, 'utf8');

const errors: string[] = [];

if (!text.includes('type: web')) errors.push('Missing API web service');
if (!text.includes('type: worker')) errors.push('Missing persistent worker service');
if (!text.includes('type: keyvalue')) errors.push('Missing Redis service');
if (!text.includes('fromDatabase')) errors.push('Missing DATABASE_URL wiring');
if (!text.includes('healthCheckPath: /health')) errors.push('Missing API health check');
if (!text.includes('npx tsx server/src/api/index.ts')) errors.push('API dockerCommand must start Fastify');
if (!text.includes('npx tsx server/src/worker/index.ts')) errors.push('Worker dockerCommand must start BullMQ worker');
if (text.includes('docker/start-stack.sh')) {
  errors.push('Colocated start-stack.sh is not allowed for production Render');
}
if (text.includes('plan: free')) errors.push('Free-tier services are not production (Postgres expires; no worker)');
if (!text.includes('maxmemoryPolicy: noeviction')) {
  errors.push('Redis must use noeviction so BullMQ keys are not evicted');
}
if (!text.includes('plan: standard')) {
  errors.push('Worker should use standard (2 GB) for Chromium');
}

if (errors.length) {
  console.error('render.yaml validation FAILED');
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}

console.log('render.yaml validation OK');
console.log('  - API is a persistent Docker web service');
console.log('  - worker is a separate persistent Docker background worker');
console.log('  - PostgreSQL + Redis wired via env groups');
console.log('  - no colocated/serverless scanner');
