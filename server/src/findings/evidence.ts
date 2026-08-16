import { looksLikeTokenKey, redactText, redactUrl } from '../security/redact.ts';
import type { FindingEvidence } from '../../../src/server/types/scan-types.ts';

export function redactEvidence(evidence: FindingEvidence): FindingEvidence {
  const out: FindingEvidence = { type: String(evidence.type) };
  for (const [k, v] of Object.entries(evidence)) {
    if (k === 'type') continue;
    out[k] = redactValue(k, v);
  }
  return out;
}

function redactValue(key: string, v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (looksLikeTokenKey(key)) return '[REDACTED]';
  if (typeof v === 'string') {
    const text = redactText(v);
    if (key.toLowerCase().includes('url') || key === 'pageUrl' || key === 'source') return redactUrl(text);
    return text;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map((item) => redactValue(key, item));
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    const nested: Record<string, unknown> = {};
    for (const [nk, nv] of Object.entries(obj)) nested[nk] = redactValue(nk, nv);
    return nested;
  }
  return String(v);
}

export function evidenceTextFrom(evidence: FindingEvidence, occurrences: number): string {
  const lines: string[] = [];
  const skip = new Set(['type']);
  for (const [k, v] of Object.entries(evidence)) {
    if (skip.has(k) || v === undefined || v === null || v === '') continue;
    if (typeof v === 'object') continue;
    lines.push(`${k} = ${formatEvidenceValue(k, v)}`);
  }
  if (occurrences > 1) lines.push(`observed ${occurrences} times`);
  return lines.join('\n');
}

function formatEvidenceValue(key: string, v: unknown): string {
  if (key === 'durationMs' && typeof v === 'number') return `${v}ms`;
  return String(v);
}
