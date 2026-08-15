import type { NetworkEvent, ResourceType } from '../../../src/server/types/scan-types.ts';

export function mapResourceType(playwrightType: string): ResourceType {
  switch (playwrightType) {
    case 'document':
      return 'document';
    case 'script':
      return 'script';
    case 'stylesheet':
      return 'stylesheet';
    case 'image':
      return 'image';
    case 'font':
      return 'font';
    case 'xhr':
      return 'xhr';
    case 'fetch':
      return 'fetch';
    case 'media':
      return 'media';
    case 'manifest':
      return 'manifest';
    case 'websocket':
      return 'websocket';
    default:
      return 'other';
  }
}

export function classifyApi(ev: {
  resourceType: ResourceType;
  method: string;
  contentType?: string;
  url: string;
  postData?: string;
}): { isApi: boolean; apiType?: 'REST' | 'GraphQL' | 'JSON' | 'WebSocket' | 'RPC' | 'other' } {
  if (ev.resourceType === 'websocket') return { isApi: true, apiType: 'WebSocket' };
  const ct = (ev.contentType ?? '').toLowerCase();
  const isXhrFetch = ev.resourceType === 'xhr' || ev.resourceType === 'fetch';
  const jsonBody = ct.includes('json') || ct.includes('graphql');
  if (!isXhrFetch && !jsonBody) return { isApi: false };

  const urlLower = ev.url.toLowerCase();
  const post = (ev.postData ?? '').slice(0, 500);
  if (ct.includes('graphql') || urlLower.includes('graphql') || post.includes('"query"') || post.includes('operationName')) {
    return { isApi: true, apiType: 'GraphQL' };
  }
  if (jsonBody || isXhrFetch) {
    if (ct.includes('json') || urlLower.endsWith('.json')) return { isApi: true, apiType: 'JSON' };
    return { isApi: true, apiType: 'REST' };
  }
  return { isApi: false };
}

export function parseRobots(text: string): { disallow: string[] } {
  const lines = text.split(/\r?\n/);
  let applies = false;
  const disallow: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [k, ...rest] = t.split(':');
    const v = rest.join(':').trim();
    if (k.toLowerCase() === 'user-agent') {
      applies = v === '*';
    } else if (applies && k.toLowerCase() === 'disallow' && v) {
      disallow.push(v);
    }
  }
  return { disallow };
}

/** Requests cancelled by our crawler or the browser, not by the site. */
export function isBenignRequestFailure(reason: string | undefined): boolean {
  if (!reason) return false;
  const r = reason.toLowerCase();
  return (
    r.includes('net::err_aborted') ||
    r.includes('ns_binding_aborted') ||
    r.includes('err_aborted') ||
    r.includes('net::err_blocked_by_client') ||
    r.includes('net::err_blocked_by_response') ||
    r.includes('frame was detached') ||
    r.includes('target closed') ||
    r.includes('context or browser has been closed')
  );
}

export function robotsBlocked(pathname: string, disallow: string[]): boolean {
  return disallow.some((d) => d !== '' && pathname.startsWith(d));
}

export function buildApiInventory(events: NetworkEvent[]) {
  const map = new Map<string, NetworkEvent[]>();
  for (const e of events.filter((x) => x.isApi)) {
    let path = e.url;
    try {
      const u = new URL(e.url);
      path = u.origin + u.pathname;
    } catch {
      /* keep */
    }
    const key = `${e.method} ${path}`;
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }
  return [...map.entries()].map(([, group]) => {
    const first = group[0];
    let path = first.url;
    try {
      const u = new URL(first.url);
      path = u.origin + u.pathname;
    } catch {
      /* keep */
    }
    return {
      method: first.method,
      url: path,
      status: first.status,
      contentType: first.responseHeaders['content-type'] ?? '',
      duration: Math.round(group.reduce((a, b) => a + b.duration, 0) / group.length),
      frequency: group.length,
      pageUrl: first.pageUrl,
      resourceType: first.resourceType,
      apiType: first.apiType ?? 'other',
      statusTag: 'OBSERVED' as const,
    };
  });
}
