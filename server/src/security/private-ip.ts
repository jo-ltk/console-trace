import net from 'node:net';

export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n << 8) + o;
  }
  return n >>> 0;
}

export function inCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const ipN = ipv4ToInt(ip);
  const baseN = ipv4ToInt(base);
  if (ipN === null || baseN === null || !Number.isInteger(bits)) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipN & mask) === (baseN & mask);
}

const V4_BLOCK = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '100.64.0.0/10',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
];

export function isPrivateOrReservedIPv4(ip: string): boolean {
  return V4_BLOCK.some((c) => inCidr(ip, c));
}

export function isPrivateOrReservedIPv6(ip: string): boolean {
  const n = ip.toLowerCase();
  if (n === '::1' || n === '::') return true;
  if (n.startsWith('fe80:')) return true;
  if (n.startsWith('fc') || n.startsWith('fd')) return true;
  if (n.startsWith('ff')) return true;
  if (n.startsWith('::ffff:')) {
    const v4 = n.slice('::ffff:'.length);
    if (net.isIPv4(v4)) return isPrivateOrReservedIPv4(v4);
  }
  return false;
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateOrReservedIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateOrReservedIPv6(ip);
  return true;
}

export function isMetadataHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return (
    h === '169.254.169.254' ||
    h === 'metadata.google.internal' ||
    h === 'metadata' ||
    h.endsWith('.internal') ||
    h === 'kubernetes.default.svc' ||
    h.endsWith('.localhost')
  );
}
