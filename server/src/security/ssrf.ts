import net from 'node:net';
import { lookupAll } from './dns-resolver.ts';
import { isBlockedIp, isMetadataHost } from './private-ip.ts';

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

export function normalizeScanUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new SsrfError('URL is required');
  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    throw new SsrfError('Invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new SsrfError('Only http and https URLs are allowed');
  }
  if (u.username || u.password) {
    throw new SsrfError('URLs with credentials are not allowed');
  }
  u.hash = '';
  return u.toString();
}

export function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0';
}

export async function assertSafeUrl(raw: string, opts?: { allowLocal?: boolean }): Promise<string> {
  const allowLocal =
    opts?.allowLocal ?? (process.env.ALLOW_LOCAL_TARGETS === 'true' || process.env.ALLOW_LOCAL_TARGETS === '1');
  const normalized = normalizeScanUrl(raw);
  const u = new URL(normalized);
  const hostname = u.hostname.replace(/^\[|\]$/g, '');

  if (isMetadataHost(hostname)) {
    throw new SsrfError('Metadata and internal hostnames are not allowed');
  }

  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname) && !(allowLocal && isLocalHostname(hostname))) {
      throw new SsrfError('Private or reserved IP addresses are not allowed');
    }
    return normalized;
  }

  if (isLocalHostname(hostname) && !allowLocal) {
    throw new SsrfError('Localhost targets are not allowed');
  }

  let records: { address: string; family: number }[];
  try {
    records = await lookupAll(hostname);
  } catch {
    throw new SsrfError('DNS resolution failed');
  }
  if (!records.length) throw new SsrfError('DNS resolution returned no addresses');

  for (const rec of records) {
    if (isBlockedIp(rec.address) && !(allowLocal && isLocalHostname(hostname))) {
      throw new SsrfError('Resolved address is private or reserved (SSRF blocked)');
    }
  }

  return normalized;
}

export async function assertSafeRedirect(url: string, opts?: { allowLocal?: boolean }): Promise<void> {
  await assertSafeUrl(url, opts);
}
