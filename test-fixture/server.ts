import http from 'node:http';
import type { AddressInfo } from 'node:net';

const pages: Record<string, { type: string; body: string | Buffer; status?: number }> = {};

function html(title: string, body: string) {
  return `<!DOCTYPE html><html lang="en"><head><title>${title}</title></head><body>${body}</body></html>`;
}

pages['/'] = {
  type: 'text/html',
  body: html(
    'TRACE Fixture Home',
    `<h1>Fixture</h1>
     <nav>
       <a href="/console">console</a>
       <a href="/runtime">runtime</a>
       <a href="/network">network</a>
       <a href="/broken-assets">broken</a>
       <a href="/accessibility">a11y</a>
       <a href="/performance">perf</a>
       <a href="/forms">forms</a>
       <a href="/navigation">nav</a>
       <a href="/missing-page">broken link</a>
     </nav>`,
  ),
};

pages['/console'] = {
  type: 'text/html',
  body: html(
    'Console',
    `<h1>Console</h1>
     <script>
       console.log('fixture-log-message');
       console.info('fixture-info-message');
       console.warn('fixture-warn-message');
       console.error('fixture-error-message');
       console.debug('fixture-debug-message');
     </script>`,
  ),
};

pages['/runtime'] = {
  type: 'text/html',
  body: html(
    'Runtime',
    `<h1>Runtime</h1>
     <script>
       setTimeout(() => { throw new Error('fixture-uncaught-exception'); }, 50);
       setTimeout(() => { Promise.reject(new Error('fixture-unhandled-rejection')); }, 80);
     </script>`,
  ),
};

pages['/network'] = {
  type: 'text/html',
  body: html(
    'Network',
    `<h1>Network</h1>
     <script>
       fetch('/api/ok').then(r => r.json());
       fetch('/api/fail').catch(() => {});
     </script>`,
  ),
};

pages['/api/ok'] = { type: 'application/json', body: '{"ok":true}' };
pages['/api/fail'] = { type: 'application/json', body: '{"error":true}', status: 500 };

pages['/broken-assets'] = {
  type: 'text/html',
  body: html(
    'Broken assets',
    `<h1>Assets</h1>
     <img src="/images/missing.png" alt="missing">
     <link rel="stylesheet" href="/css/missing.css">
     <script src="/js/missing.js"></script>`,
  ),
};

pages['/accessibility'] = {
  type: 'text/html',
  body: `<!DOCTYPE html><html><head><title>A11y</title></head><body>
    <img src="/images/dot.png">
    <button></button>
    <input type="text">
  </body></html>`,
};

pages['/performance'] = {
  type: 'text/html',
  body: html(
    'Performance',
    `<h1>Slow</h1><script>fetch('/slow')</script>`,
  ),
};

pages['/hang'] = {
  type: 'text/html',
  body: html('Hang', '<h1>Hang</h1><p>slow page</p>'),
};

pages['/forms'] = {
  type: 'text/html',
  body: html(
    'Forms',
    `<form action="/login" method="post">
      <input type="password" name="password">
      <input type="text" name="email" required>
      <button type="submit">Save</button>
    </form>`,
  ),
};

pages['/navigation'] = {
  type: 'text/html',
  body: html('Navigation', `<a href="/console">to console</a><button>Open menu</button>`),
};

pages['/images/dot.png'] = {
  type: 'image/png',
  body: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
};

pages['/robots.txt'] = { type: 'text/plain', body: 'User-agent: *\nAllow: /\n' };
pages['/manifest.json'] = {
  type: 'application/manifest+json',
  body: '{"name":"Fixture","short_name":"Fix","display":"standalone","icons":[{"src":"/images/dot.png","sizes":"1x1"}]}',
};

export function startFixture(port = 0): Promise<{ server: http.Server; port: number; url: string }> {
  const server = http.createServer((req, res) => {
    const url = req.url?.split('?')[0] ?? '/';
    if (url === '/slow') {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"slow":true}');
      }, 400);
      return;
    }
    if (url === '/hang') {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>finally</body></html>');
      }, 5000);
      return;
    }
    const page = pages[url];
    if (!page) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(page.status ?? 200, { 'Content-Type': page.type });
    res.end(page.body);
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({ server, port: addr.port, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

if (process.argv[1]?.includes('test-fixture')) {
  const port = Number(process.env.FIXTURE_PORT ?? 4173);
  startFixture(port).then(({ url }) => {
    console.log(`fixture listening ${url}`);
  });
}
