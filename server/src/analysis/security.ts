import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import type { CookieFinding, SecurityFinding, SourceMapFinding } from '../../../src/server/types/scan-types.ts';
import { redactUrl } from '../security/redact.ts';
import { isFirstPartyHost } from '../url/normalize.ts';

const HEADER_CHECKS: { name: string; header: string; missingStatus: 'FAIL' | 'WARNING' | 'INFO' }[] = [
  { name: 'Content-Security-Policy', header: 'content-security-policy', missingStatus: 'WARNING' },
  { name: 'Strict-Transport-Security', header: 'strict-transport-security', missingStatus: 'WARNING' },
  { name: 'X-Content-Type-Options', header: 'x-content-type-options', missingStatus: 'WARNING' },
  { name: 'Referrer-Policy', header: 'referrer-policy', missingStatus: 'INFO' },
  { name: 'Permissions-Policy', header: 'permissions-policy', missingStatus: 'INFO' },
  { name: 'Cross-Origin-Opener-Policy', header: 'cross-origin-opener-policy', missingStatus: 'INFO' },
  { name: 'Cross-Origin-Resource-Policy', header: 'cross-origin-resource-policy', missingStatus: 'INFO' },
  { name: 'Cross-Origin-Embedder-Policy', header: 'cross-origin-embedder-policy', missingStatus: 'INFO' },
];

export function analyzeSecurityHeaders(headers: Record<string, string>, pageUrl: string): SecurityFinding[] {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  const findings: SecurityFinding[] = [];

  for (const check of HEADER_CHECKS) {
    const value = lower[check.header];
    findings.push({
      id: `hdr-${check.header}`,
      category: 'HEADER',
      name: check.name,
      severity: value ? 'INFO' : check.missingStatus === 'INFO' ? 'INFO' : 'WARNING',
      status: value ? 'PASS' : check.missingStatus,
      evidence: value ? `${pageUrl} response includes ${check.name}: ${value.slice(0, 200)}` : `${pageUrl} response missing ${check.name}`,
    });
  }

  const csp = lower['content-security-policy'] ?? '';
  if (csp.includes('unsafe-inline')) {
    findings.push({
      id: 'hdr-csp-unsafe-inline',
      category: 'HEADER',
      name: 'CSP unsafe-inline',
      severity: 'WARNING',
      status: 'WARNING',
      evidence: `CSP contains unsafe-inline on ${pageUrl}`,
    });
  }
  if (csp.includes('unsafe-eval')) {
    findings.push({
      id: 'hdr-csp-unsafe-eval',
      category: 'HEADER',
      name: 'CSP unsafe-eval',
      severity: 'WARNING',
      status: 'WARNING',
      evidence: `CSP contains unsafe-eval on ${pageUrl}`,
    });
  }
  const frameAncestors = csp.match(/frame-ancestors\s+([^;]+)/i);
  if (frameAncestors) {
    findings.push({
      id: 'hdr-frame-ancestors',
      category: 'HEADER',
      name: 'CSP frame-ancestors',
      severity: 'INFO',
      status: 'PASS',
      evidence: `frame-ancestors ${frameAncestors[1].trim()}`,
    });
  }
  return findings;
}

export function analyzeCorsHeaders(headers: Record<string, string>, requestUrl: string): SecurityFinding[] {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  const aco = lower['access-control-allow-origin'];
  const acc = lower['access-control-allow-credentials'];
  if (!aco) return [];
  const findings: SecurityFinding[] = [];
  if (aco === '*' && acc === 'true') {
    findings.push({
      id: `cors-wildcard-creds-${requestUrl}`,
      category: 'CORS',
      name: 'Wildcard origin with credentials',
      severity: 'ERROR',
      status: 'FAIL',
      evidence: `${redactUrl(requestUrl)} ACAO=* with credentials=true`,
    });
  } else if (aco === '*') {
    let host = requestUrl;
    try {
      host = new URL(requestUrl).hostname;
    } catch {
      /* keep url */
    }
    findings.push({
      id: `cors-wildcard-${host}`,
      category: 'CORS',
      name: 'Wildcard CORS origin',
      severity: 'INFO',
      status: 'INFO',
      evidence: `${redactUrl(requestUrl)} Access-Control-Allow-Origin: *`,
    });
  }
  return findings;
}

const SESSION_COOKIE = /session|sessid|^sid$|auth|token|jwt|csrf|login|userid/i;

export function analyzeCookies(
  cookies: { name: string; domain: string; path: string; secure: boolean; httpOnly: boolean; sameSite?: string }[],
  pageIsHttps: boolean,
  pageHost?: string,
): CookieFinding[] {
  return cookies.map((c) => {
    const reasons: string[] = [];
    const cookieHost = c.domain.replace(/^\./, '');
    const firstParty = pageHost ? isFirstPartyHost(cookieHost, pageHost) : true;
    const sessionLike = SESSION_COOKIE.test(c.name);
    const ss = (c.sameSite ?? 'unspecified').toLowerCase();

    if (ss === 'none' && !c.secure) reasons.push('SameSite=None without Secure');
    if (!firstParty) {
      return {
        name: c.name,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite ?? 'unspecified',
        isRisky: reasons.length > 0,
        riskReason: reasons.join('; ') || undefined,
      };
    }
    if (pageIsHttps && !c.secure) reasons.push('Secure flag missing on HTTPS site');
    if (sessionLike && !c.httpOnly) reasons.push('HttpOnly flag missing on session-like cookie');
    if (sessionLike && (ss === 'unspecified' || ss === '')) reasons.push('SameSite unspecified');
    return {
      name: c.name,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite ?? 'unspecified',
      isRisky: reasons.length > 0,
      riskReason: reasons.join('; ') || undefined,
    };
  });
}

export async function inspectTls(hostname: string, port = 443): Promise<SecurityFinding[]> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: hostname, port, servername: hostname, rejectUnauthorized: true },
      () => {
        const cert = socket.getPeerCertificate();
        const authorized = socket.authorized;
        const validTo = cert.valid_to ? Date.parse(cert.valid_to) : NaN;
        const findings: SecurityFinding[] = [
          {
            id: 'tls-https',
            category: 'TLS',
            name: 'HTTPS available',
            severity: 'INFO',
            status: 'PASS',
            evidence: `TLS handshake succeeded for ${hostname}:${port} authorized=${authorized}`,
          },
        ];
        if (!Number.isNaN(validTo)) {
          const days = Math.round((validTo - Date.now()) / 86400000);
          findings.push({
            id: 'tls-expiry',
            category: 'TLS',
            name: 'Certificate expiration',
            severity: days < 14 ? 'WARNING' : 'INFO',
            status: days < 0 ? 'FAIL' : days < 14 ? 'WARNING' : 'PASS',
            evidence: `Certificate valid_to=${cert.valid_to} (${days} days)`,
          });
        }
        socket.end();
        resolve(findings);
      },
    );
    socket.setTimeout(8000, () => {
      socket.destroy();
      resolve([
        {
          id: 'tls-timeout',
          category: 'TLS',
          name: 'TLS inspection',
          severity: 'WARNING',
          status: 'NOT TESTED',
          evidence: `TLS handshake timed out for ${hostname}:${port}`,
        },
      ]);
    });
    socket.on('error', (err) => {
      resolve([
        {
          id: 'tls-error',
          category: 'TLS',
          name: 'TLS inspection',
          severity: 'ERROR',
          status: 'FAIL',
          evidence: `TLS error for ${hostname}: ${err.message}`,
        },
      ]);
    });
  });
}

export async function checkSourceMapAccessible(scriptUrl: string): Promise<SourceMapFinding | null> {
  const mapUrl = scriptUrl.endsWith('.map') ? scriptUrl : `${scriptUrl}.map`;
  try {
    const res = await fetchHeadOrGet(mapUrl);
    return {
      scriptUrl,
      mapUrl,
      isAccessible: res.status >= 200 && res.status < 300,
      statusCode: res.status,
      sizeBytes: res.size,
      hasSources: res.hasSources,
    };
  } catch {
    return {
      scriptUrl,
      mapUrl,
      isAccessible: false,
    };
  }
}

function fetchHeadOrGet(url: string): Promise<{ status: number; size?: number; hasSources?: boolean }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        method: 'HEAD',
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        timeout: 8000,
        headers: { 'User-Agent': 'TRACE-Scanner/1.0' },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const len = res.headers['content-length'] ? Number(res.headers['content-length']) : undefined;
        res.resume();
        if (status === 405 || status === 501) {
          getMap(url).then(resolve).catch(reject);
          return;
        }
        resolve({ status, size: Number.isFinite(len) ? len : undefined });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.end();
  });
}

function getMap(url: string): Promise<{ status: number; size?: number; hasSources?: boolean }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        method: 'GET',
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        timeout: 8000,
        headers: { 'User-Agent': 'TRACE-Scanner/1.0', Range: 'bytes=0-2048' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c as Buffer));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString('utf8');
          resolve({
            status: res.statusCode ?? 0,
            size: buf.length,
            hasSources: text.includes('"sources"'),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

export async function safeHeadOrGet(
  url: string,
  method: 'HEAD' | 'GET' | 'OPTIONS' = 'HEAD',
): Promise<{ status: number; headers: Record<string, string>; redirectedTo?: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        method,
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        timeout: 8000,
        headers: { 'User-Agent': 'TRACE-Scanner/1.0' },
      },
      (res) => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === 'string') headers[k.toLowerCase()] = v;
          else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(', ');
        }
        res.resume();
        resolve({
          status: res.statusCode ?? 0,
          headers,
          redirectedTo: headers.location,
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.end();
  });
}
