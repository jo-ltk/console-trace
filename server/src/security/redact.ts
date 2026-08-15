/** Sensitive header and query-parameter redaction. Never store raw secrets. */

const SENSITIVE_HEADER = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'proxy-authorization',
  'x-auth-token',
  'x-access-token',
]);

const SENSITIVE_QUERY = new Set([
  'token',
  'key',
  'api_key',
  'apikey',
  'password',
  'secret',
  'authorization',
  'access_token',
  'refresh_token',
  'session',
  'sessionid',
  'session_id',
  'jwt',
  'auth',
]);

const JWT_RE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const BEARER_RE = /^Bearer\s+/i;

export function redactHeaderName(name: string): boolean {
  return SENSITIVE_HEADER.has(name.toLowerCase());
}

export function redactHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [k, v] of Object.entries(headers)) {
    if (redactHeaderName(k) || looksLikeSecret(v)) out[k] = '[REDACTED]';
    else out[k] = v;
  }
  return out;
}

export function looksLikeSecret(value: string): boolean {
  const v = value.trim();
  if (BEARER_RE.test(v)) return true;
  if (JWT_RE.test(v)) return true;
  return false;
}

export function looksLikeTokenKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.includes('token') ||
    k.includes('jwt') ||
    k.includes('session') ||
    k.includes('auth') ||
    k.includes('password') ||
    k.includes('secret') ||
    k.includes('apikey') ||
    k.includes('api_key')
  );
}

export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const key of [...u.searchParams.keys()]) {
      if (SENSITIVE_QUERY.has(key.toLowerCase()) || looksLikeTokenKey(key)) {
        u.searchParams.set(key, '[REDACTED]');
      }
    }
    return u.toString();
  } catch {
    return raw;
  }
}

export function redactCookieName(name: string): string {
  return name;
}

export function redactText(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]');
}
