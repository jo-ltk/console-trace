import dns from 'node:dns/promises';

export async function lookupAll(hostname: string): Promise<{ address: string; family: number }[]> {
  return dns.lookup(hostname, { all: true, verbatim: true });
}
