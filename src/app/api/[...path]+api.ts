const UPSTREAM_API = (
  process.env.EXPO_PUBLIC_API_URL || 'https://trace-api-15uf.onrender.com'
).replace(/\/$/, '');

const UPSTREAM_TIMEOUT_MS = 25000;
const MAX_UPSTREAM_RETRIES = 3;

function normalizePath(path: string | string[]): string {
  if (Array.isArray(path)) return path.join('/');
  return path;
}

function isRetryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504 || status === 429;
}

async function fetchUpstream(target: string, init: RequestInit): Promise<Response> {
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt < MAX_UPSTREAM_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const res = await fetch(target, { ...init, signal: controller.signal });
      if (isRetryableStatus(res.status) && attempt < MAX_UPSTREAM_RETRIES - 1) {
        lastResponse = res;
        await sleep(400 * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < MAX_UPSTREAM_RETRIES - 1) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return lastResponse ?? new Response(JSON.stringify({ error: 'Upstream unavailable' }), { status: 502 });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function proxyRequest(request: Request, path: string | string[]): Promise<Response> {
  const incoming = new URL(request.url);
  const suffix = normalizePath(path);
  const target = `${UPSTREAM_API}/api/${suffix}${incoming.search}`;

  const headers = new Headers();
  const contentType = request.headers.get('Content-Type');
  if (contentType) headers.set('Content-Type', contentType);

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text();
  }

  let upstream: Response;
  try {
    upstream = await fetchUpstream(target, init);
  } catch {
    return new Response(JSON.stringify({ error: 'API temporarily unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const responseHeaders = new Headers();
  const upstreamType = upstream.headers.get('Content-Type');
  if (upstreamType) responseHeaders.set('Content-Type', upstreamType);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

type RouteContext = { path: string | string[] };

export function GET(request: Request, { path }: RouteContext) {
  return proxyRequest(request, path);
}

export function POST(request: Request, { path }: RouteContext) {
  return proxyRequest(request, path);
}

export function PUT(request: Request, { path }: RouteContext) {
  return proxyRequest(request, path);
}

export function PATCH(request: Request, { path }: RouteContext) {
  return proxyRequest(request, path);
}

export function DELETE(request: Request, { path }: RouteContext) {
  return proxyRequest(request, path);
}

export function HEAD(request: Request, { path }: RouteContext) {
  return proxyRequest(request, path);
}
