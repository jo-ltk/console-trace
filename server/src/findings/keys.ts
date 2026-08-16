import { createHash } from 'node:crypto';
import { redactUrl } from '../security/redact.ts';

export function hashKey(parts: Array<string | number | undefined | null>): string {
  const raw = parts.map((p) => (p === undefined || p === null ? '' : String(p))).join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

export function normalizeMessage(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 500);
}

export function normalizeFindingUrl(raw: string): string {
  const redacted = redactUrl(raw);
  try {
    const u = new URL(redacted);
    u.hash = '';
    return u.toString();
  } catch {
    return redacted.split('#')[0] ?? redacted;
  }
}

export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}
