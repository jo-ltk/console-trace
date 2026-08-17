const DEFAULT_PRODUCTION_WEB_ORIGINS = ['https://trace-inspector.expo.app'];

export function parseCorsOrigins(raw: string | undefined, nodeEnv: string): string[] {
  if (raw !== undefined && raw !== '') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (nodeEnv === 'production') return [...DEFAULT_PRODUCTION_WEB_ORIGINS];
  return ['*'];
}

/** Native clients (Expo) omit Origin. Browser origins must be allowlisted in production. */
export function isCorsOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return true;
  if (allowed.includes('*')) return true;
  return allowed.includes(origin);
}
