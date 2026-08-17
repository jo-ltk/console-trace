const UPSTREAM_API = (
  process.env.EXPO_PUBLIC_API_URL || 'https://trace-api-15uf.onrender.com'
).replace(/\/$/, '');

function normalizePath(path: string | string[]): string {
  if (Array.isArray(path)) return path.join('/');
  return path;
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

  const upstream = await fetch(target, init);
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
