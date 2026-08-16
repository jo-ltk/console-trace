#!/usr/bin/env npx tsx
/**
 * Validate render.yaml structure for the TRACE free-tier deployment.
 */
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'render.yaml');
const text = fs.readFileSync(file, 'utf8');

const errors: string[] = [];

if (!text.includes('plan: free')) errors.push('Expected plan: free entries');
if (text.includes('plan: starter')) errors.push('Found paid plan: starter');
if (text.includes('plan: standard')) errors.push('Found paid plan: standard');
if (text.includes('plan: basic-')) errors.push('Found paid postgres plan');
if (text.includes('type: worker')) errors.push('Separate worker service is not free on Render');
if (!text.includes('docker/start-stack.sh')) errors.push('Missing colocated stack command');
if (!text.includes('healthCheckPath: /health')) errors.push('Missing health check');
if (!text.includes('fromDatabase')) errors.push('Missing DATABASE_URL wiring');
if (!text.includes('type: keyvalue')) errors.push('Missing Redis service');

const paidPatterns = [/plan:\s*starter/i, /plan:\s*standard/i, /plan:\s*pro/i, /plan:\s*basic-/i];
for (const pattern of paidPatterns) {
  if (pattern.test(text)) errors.push(`Paid plan pattern matched: ${pattern}`);
}

if (errors.length) {
  console.error('render.yaml validation FAILED');
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}

console.log('render.yaml validation OK');
console.log('  - all services use plan: free');
console.log('  - API + worker colocated via docker/start-stack.sh');
console.log('  - no separate paid worker service');
