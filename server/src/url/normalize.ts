export function normalizePageUrl(raw: string, base?: string): string | null {
  try {
    const u = base ? new URL(raw, base) : new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) {
      u.port = '';
    }
    if (u.pathname === '') u.pathname = '/';
    return u.toString();
  } catch {
    return null;
  }
}

export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function sameOrigin(a: string, b: string): boolean {
  const oa = originOf(a);
  const ob = originOf(b);
  return Boolean(oa && ob && oa === ob);
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Cookie Domain=.intel.com is first-party to www.intel.com; scene7.com is not. */
export function isFirstPartyHost(resourceHost: string, pageHost: string): boolean {
  const a = resourceHost.replace(/^\./, '').toLowerCase();
  const b = pageHost.replace(/^\./, '').toLowerCase();
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}
