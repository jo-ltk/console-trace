import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type Browser, type BrowserContext, type Page, type Request } from 'playwright';
import { createScanContext, launchBrowser } from './browser.ts';
import { runAccessibilityScan } from './accessibility.ts';
import type {
  AccessibilityFinding,
  ConsoleEvent,
  FormFinding,
  NetworkEvent,
  NetworkFailure,
  ScannerBlockedRequest,
  PerformanceMetrics,
  PwaObservation,
  RedirectChain,
  RuntimeErrorEvent,
  ScanOptions,
  ScanResult,
  ScanStatus,
  ScannedPageResult,
  SecurityFinding,
  SeoFinding,
  ServiceWorkerObservation,
  SourceMapFinding,
  StorageInspection,
  ThirdPartyDomain,
  WebSocketObservation,
} from '../../../src/server/types/scan-types.ts';
import { config } from '../config.ts';
import { redactHeaders, redactText, redactUrl } from '../security/redact.ts';
import { assertSafeRedirect } from '../security/ssrf.ts';
import { hostOf, isFirstPartyHost, normalizePageUrl, originOf, sameOrigin } from '../url/normalize.ts';
import {
  analyzeCookies,
  analyzeCorsHeaders,
  analyzeSecurityHeaders,
  checkSourceMapAccessible,
  inspectTls,
  safeHeadOrGet,
} from '../analysis/security.ts';
import {
  DANGEROUS_CLICK,
  DOM_EXTRACT_SCRIPT,
  INTERACTIVE_ELEMENTS_SCRIPT,
  PERF_SCRIPT,
  STORAGE_SCRIPT,
  isDangerousControl,
  seoFromExtract,
  type DomExtract,
} from '../analysis/dom.ts';
import {
  buildApiInventory,
  classifyApi,
  mapResourceType,
  parseRobots,
  robotsBlocked,
} from '../analysis/network.ts';
import { isActionableBrokenResource, isActionableNetworkFailure } from '../analysis/network-failure.ts';
import { wouldTraceBlockRequest } from './resource-blocking.ts';
import { computeHealthScores } from '../scoring/health.ts';
import { classifyConsoleSource, isTargetConsoleEvent, mapPlaywrightConsoleType } from './console-source.ts';
import { buildFindings } from '../findings/pipeline.ts';
import { summarizeFindings } from '../findings/report.ts';
import { issuesFromFindings } from '../findings/issues.ts';

export type ProgressFn = (status: ScanStatus, extra?: Record<string, unknown>) => Promise<void> | void;

export interface EngineInput {
  scanId: string;
  url: string;
  options: ScanOptions;
  onProgress?: ProgressFn;
  shouldCancel?: () => Promise<boolean> | boolean;
}

function id(): string {
  return randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function runScanEngine(input: EngineInput): Promise<ScanResult> {
  const started = Date.now();
  const opts = normalizeOptions(input.options);
  const warnings: string[] = [];
  const unavailable: Record<string, string> = {};

  const consoleEvents: ConsoleEvent[] = [];
  const runtimeErrors: RuntimeErrorEvent[] = [];
  const networkEvents: NetworkEvent[] = [];
  const networkFailures: NetworkFailure[] = [];
  const scannerBlockedRequests: ScannerBlockedRequest[] = [];
  const webSockets: WebSocketObservation[] = [];
  const pages: ScannedPageResult[] = [];
  const forms: FormFinding[] = [];
  const seoFindings: SeoFinding[] = [];
  const accessibility: AccessibilityFinding[] = [];
  const securityFindings: SecurityFinding[] = [];
  const sourceMaps: SourceMapFinding[] = [];
  const redirects: RedirectChain[] = [];
  let storage: StorageInspection = {
    localStorageKeys: [],
    sessionStorageKeys: [],
    indexedDbNames: [],
    hasDetectedToken: false,
    tokenLocations: [],
  };
  let serviceWorker: ServiceWorkerObservation = { status: 'not_supported' };
  const pwa: PwaObservation = {
    hasManifest: false,
    hasIcons: false,
    hasServiceWorker: false,
  };
  let performance: PerformanceMetrics = emptyPerf();
  const screenshots: ScanResult['screenshots'] = { errorPages: {} };
  const visited = new Set<string>();
  const queued: { url: string; depth: number; fromUrl?: string }[] = [{ url: input.url, depth: 0 }];
  const discovered = new Set<string>([input.url]);
  const requestStarts = new Map<Request, number>();
  let currentPageUrl = input.url;
  let robotsDisallow: string[] = [];
  let cancelled = false;

  await input.onProgress?.('launching_browser');

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;

  try {
    browser = await launchBrowser();
    context = await createScanContext(browser, { device: opts.device, timeout: opts.timeout, startUrl: input.url });
    await context.addInitScript(() => {
      window.addEventListener('unhandledrejection', (ev) => {
        const reason = ev.reason;
        const message = reason && reason.message ? String(reason.message) : String(reason);
        const stack = reason && reason.stack ? String(reason.stack) : '';
        console.error('[TRACE_UNHANDLED_REJECTION]', message, stack);
      });
      const w = window as unknown as { __TRACE_LCP?: number };
      try {
        const po = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) w.__TRACE_LCP = last.startTime;
        });
        po.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch {
        /* LCP observer not supported */
      }
    });

    try {
      const origin = originOf(input.url);
      if (origin) {
        const robotsUrl = `${origin}/robots.txt`;
        try {
          const r = await safeHeadOrGet(robotsUrl, 'GET');
          if (r.status >= 200 && r.status < 300) {
            const body = await fetchText(robotsUrl);
            robotsDisallow = parseRobots(body).disallow;
          }
        } catch {
          warnings.push('robots.txt UNAVAILABLE');
        }
      }
    } catch {
      warnings.push('robots.txt NOT TESTED');
    }

    await input.onProgress?.('loading_page');

    while (queued.length && visited.size < opts.maxPages && Date.now() - started < opts.maxDurationMs) {
      if (await input.shouldCancel?.()) {
        cancelled = true;
        break;
      }
      const item = queued.shift()!;
      const url = normalizePageUrl(item.url) ?? item.url;
      if (visited.has(url)) continue;
      const pathOnly = (() => {
        try {
          return new URL(url).pathname;
        } catch {
          return '/';
        }
      })();
      if (robotsDisallow.length && robotsBlocked(pathOnly, robotsDisallow)) {
        continue;
      }
      visited.add(url);
      currentPageUrl = url;
      await input.onProgress?.('discovering_pages', { page: url, visited: visited.size });

      const pageStarted = Date.now();
      let statusCode = 0;
      let title = '';
      const page = await context.newPage();
      page.setDefaultTimeout(opts.timeout);
      attachObservers(page);
      try {
        const nav = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: opts.timeout });
        statusCode = nav?.status() ?? 0;
        await page.waitForLoadState('load', { timeout: Math.min(8000, opts.timeout) }).catch(() => undefined);
        await page.waitForTimeout(Math.min(800, opts.timeout / 8));
        title = await page.title();

        if (visited.size === 1) {
          await captureRedirects(url, redirects);
          if (opts.security) {
            const headers = headerMap(nav);
            securityFindings.push(...analyzeSecurityHeaders(headers, url));
            const u = new URL(url);
            if (u.protocol === 'https:') {
              securityFindings.push(...(await inspectTls(u.hostname, u.port ? Number(u.port) : 443)));
            } else {
              securityFindings.push({
                id: 'tls-http',
                category: 'TLS',
                name: 'HTTPS availability',
                severity: 'WARNING',
                status: 'FAIL',
                evidence: `Start URL used HTTP: ${url}`,
              });
            }
          }
          if (config.scanScreenshotsEnabled) {
            try {
              const vp = await page.screenshot({ fullPage: false, type: 'png' });
              const dir = path.join(config.artifactDir, input.scanId);
              await fs.mkdir(dir, { recursive: true });
              if (vp.length <= config.maxScreenshotBytes) {
                const p = path.join(dir, 'viewport.png');
                await fs.writeFile(p, vp);
                screenshots.viewport = p;
              }
            } catch (err) {
              warnings.push(`screenshot UNAVAILABLE: ${(err as Error).message}`);
            }
          }
        }

        await input.onProgress?.('observing_network');
        const extract = (await page.evaluate(`(${DOM_EXTRACT_SCRIPT})()`)) as DomExtract;
        forms.push(...extract.forms);
        seoFindings.push(seoFromExtract(url, extract));
        if (extract.manifestUrl) {
          pwa.hasManifest = true;
          pwa.manifestUrl = extract.manifestUrl;
          pwa.themeColor = extract.themeColor;
          try {
            const abs = new URL(extract.manifestUrl, url).toString();
            const text = await fetchText(abs);
            const man = JSON.parse(text) as { name?: string; short_name?: string; display?: string; icons?: unknown[] };
            pwa.name = man.name;
            pwa.shortName = man.short_name;
            pwa.display = man.display;
            pwa.hasIcons = Array.isArray(man.icons) && man.icons.length > 0;
          } catch {
            warnings.push('PWA manifest parse UNAVAILABLE');
          }
        }

        try {
          storage = (await page.evaluate(`(${STORAGE_SCRIPT})()`)) as StorageInspection;
          if (storage.hasDetectedToken) {
            storage.tokenLocations = [...new Set(storage.tokenLocations)];
          }
        } catch {
          warnings.push('storage inspection UNAVAILABLE');
        }

        try {
          const sw = await page.evaluate(async () => {
            if (!('serviceWorker' in navigator)) return { status: 'not_supported' as const };
            const regs = await navigator.serviceWorker.getRegistrations();
            if (!regs.length) return { status: 'not_supported' as const };
            const r = regs[0];
            return {
              status: 'registered' as const,
              scope: r.scope,
              scriptUrl: r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL,
            };
          });
          serviceWorker = sw;
          pwa.hasServiceWorker = sw.status === 'registered';
        } catch (err) {
          serviceWorker = { status: 'failed', error: (err as Error).message };
        }

        if (opts.performance && visited.size === 1) {
          await input.onProgress?.('analyzing_runtime');
          try {
            const perf = (await page.evaluate(`(${PERF_SCRIPT})()`)) as {
              fcp: number | null;
              lcp: number | null;
              cls: number;
              ttfb: number | null;
              domContentLoaded: number | null;
              loadTime: number | null;
              longTasksCount: number;
              observedLcp?: number | null;
            };
            const lcp = perf.lcp ?? perf.observedLcp ?? null;
            performance = {
              ...performance,
              fcp: perf.fcp ?? 'NOT AVAILABLE',
              lcp: lcp ?? 'NOT AVAILABLE',
              cls: perf.cls,
              inp: 'NOT AVAILABLE',
              ttfb: perf.ttfb ?? 'NOT AVAILABLE',
              domContentLoaded: perf.domContentLoaded ?? 'NOT AVAILABLE',
              loadTime: perf.loadTime ?? 'NOT AVAILABLE',
              longTasksCount: perf.longTasksCount,
            };
          } catch (err) {
            unavailable.performance = (err as Error).message;
            warnings.push(`performance UNAVAILABLE: ${(err as Error).message}`);
          }
        }

        if (opts.accessibility) {
          await input.onProgress?.('running_accessibility');
          try {
            accessibility.push(...(await runAccessibilityScan(page, url, id)));
          } catch (err) {
            unavailable.accessibility = (err as Error).message;
            warnings.push(`accessibility FAILED: ${(err as Error).message}`);
          }
        }

        if (opts.interactions) {
          await safeInteract(page);
        }

        if (item.depth < opts.maxDepth) {
          const extractLinks = extract.links || [];
          for (const href of extractLinks) {
            const n = normalizePageUrl(href, url);
            if (!n) continue;
            if (!sameOrigin(input.url, n)) continue;
            if (discovered.has(n) || visited.has(n)) continue;
            if (discovered.size >= opts.maxPages) break;
            discovered.add(n);
            queued.push({ url: n, depth: item.depth + 1, fromUrl: url });
          }
        }
      } catch (err) {
        const msg = (err as Error).message;
        runtimeErrors.push({
          id: id(),
          message: msg,
          pageUrl: url,
          timestamp: nowIso(),
          type: 'execution_failure',
        });
        if (!screenshots.errorPages) screenshots.errorPages = {};
        if (config.scanScreenshotsEnabled) {
          try {
            const buf = await page.screenshot({ fullPage: false, type: 'png' });
            if (buf.length <= config.maxScreenshotBytes) {
              const dir = path.join(config.artifactDir, input.scanId);
              await fs.mkdir(dir, { recursive: true });
              const p = path.join(dir, `error-${visited.size}.png`);
              await fs.writeFile(p, buf);
              screenshots.errorPages[`page-${visited.size}`] = p;
            }
          } catch {
            /* ignore */
          }
        }
      } finally {
        await page.close().catch(() => undefined);
      }

      const duration = Date.now() - pageStarted;
      pages.push({
        id: id(),
        url,
        title,
        status: statusCode >= 400 ? 'error' : 'healthy',
        statusCode,
        issuesCount: 0,
        duration,
        depth: item.depth,
        linkedFrom: item.fromUrl,
      });
    }

    await input.onProgress?.('analyzing_security');

    const cookies = await context.cookies();
    const pageIsHttps = input.url.startsWith('https://');
    const cookieFindings = analyzeCookies(
      cookies.map((c) => ({
        name: c.name,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: String(c.sameSite ?? 'unspecified'),
      })),
      pageIsHttps,
      hostOf(input.url) ?? undefined,
    );
    for (const c of cookieFindings.filter((x) => x.isRisky)) {
      securityFindings.push({
        id: `cookie-${c.name}`,
        category: 'COOKIE',
        name: `Cookie flags: ${c.name}`,
        severity: 'WARNING',
        status: 'WARNING',
        evidence: `${c.name} domain=${c.domain} ${c.riskReason} (value not stored)`,
      });
    }

    const mixed = networkEvents.filter((e) => e.pageUrl.startsWith('https://') && e.url.startsWith('http://'));
    for (const m of mixed) {
      securityFindings.push({
        id: `mixed-${m.id}`,
        category: 'MIXED_CONTENT',
        name: 'Mixed content',
        severity: 'ERROR',
        status: 'FAIL',
        evidence: `HTTPS page ${m.pageUrl} loaded HTTP resource ${redactUrl(m.url)}`,
      });
    }

    const pageHost = hostOf(input.url);
    const scripts = networkEvents.filter((e) => {
      if (e.resourceType !== 'script' || e.status < 200 || e.status >= 400) return false;
      const h = hostOf(e.url);
      return Boolean(pageHost && h && isFirstPartyHost(h, pageHost));
    });
    const uniqueScripts = [...new Set(scripts.map((s) => s.url))].slice(0, 15);
    for (const su of uniqueScripts) {
      const sm = await checkSourceMapAccessible(su);
      if (sm) {
        sourceMaps.push(sm);
        if (sm.isAccessible) {
          securityFindings.push({
            id: `smap-${su}`,
            category: 'SOURCEMAP',
            name: 'PUBLIC SOURCE MAP',
            severity: 'WARNING',
            status: 'WARNING',
            evidence: `${redactUrl(sm.mapUrl)} status=${sm.statusCode} (contents not included)`,
          });
        }
      }
    }

    if (opts.activeProbing) {
      await probeLinks(input.url, pages.map((p) => p.url), opts);
    }

    const seenSec = new Set<string>();
    const dedupedSec: SecurityFinding[] = [];
    for (const f of securityFindings) {
      const key = `${f.category}|${f.name}|${f.status}|${f.id}`;
      if (seenSec.has(key)) continue;
      seenSec.add(key);
      dedupedSec.push(f);
    }
    securityFindings.length = 0;
    securityFindings.push(...dedupedSec);

    performance = applyResourceSizes(performance, networkEvents);

    const thirdParty = buildThirdParty(networkEvents, input.url);
    const brokenResources = networkEvents
      .filter((e) => ['image', 'script', 'stylesheet', 'font', 'media', 'manifest', 'document'].includes(e.resourceType))
      .filter((e) =>
        isActionableBrokenResource({
          status: e.status,
          failureReason: e.failureReason,
          resourceType: e.resourceType,
          url: e.url,
          startUrl: input.url,
        }),
      )
      .map((e) => ({
        url: e.url,
        pageUrl: e.pageUrl,
        resourceType: e.resourceType,
        status: e.status,
        error: e.failureReason,
      }));

    const brokenLinks = await collectBrokenLinks(pages, networkEvents, input.url, opts.activeProbing === true);

    const findings = buildFindings({
      scanId: input.scanId,
      targetUrl: input.url,
      pages,
      consoleEvents,
      runtimeErrors,
      networkFailures,
      brokenResources,
      brokenLinks,
      accessibility,
      securityFindings,
      seoFindings,
      performance,
    });
    const findingsSummary = summarizeFindings(findings);
    const issues = issuesFromFindings(findings);

    for (const p of pages) {
      const pageFindings = findings.filter((f) => f.pages.includes(p.url) || f.location.pageUrl === p.url);
      p.issuesCount = pageFindings.length;
      const hasError = pageFindings.some((f) => f.severity === 'CRITICAL' || f.severity === 'ERROR');
      const hasWarn = pageFindings.some((f) => f.severity === 'WARNING');
      if (p.statusCode >= 400) p.status = 'error';
      else if (hasError) p.status = 'error';
      else if (hasWarn) p.status = 'warning';
      else p.status = 'healthy';
    }

    const targetConsole = consoleEvents.filter((e) => isTargetConsoleEvent(e.source));
    const scores = computeHealthScores({
      consoleEvents,
      runtimeErrors,
      networkFailures,
      performance,
      accessibility,
      securityFindings,
      seoFindings,
      brokenAssets: brokenResources.length,
      unavailable,
      findings,
    });

    await input.onProgress?.('generating_report');

    const durationMs = Date.now() - started;
    const status: ScanResult['scan']['status'] = cancelled
      ? 'cancelled'
      : warnings.length || Object.keys(unavailable).length
        ? 'completed_with_warnings'
        : 'completed';

    const result: ScanResult = {
      scan: {
        id: input.scanId,
        url: input.url,
        normalizedUrl: input.url,
        status,
        statusReason: warnings.length ? warnings.join('; ') : undefined,
        startedAt: new Date(started).toISOString(),
        completedAt: nowIso(),
        durationMs,
        device: opts.device,
      },
      summary: {
        pagesDiscovered: discovered.size,
        pagesScanned: pages.length,
        requestsObserved: networkEvents.length,
        consoleEvents: targetConsole.length,
        consoleTargetEvents: targetConsole.length,
        consoleScannerEvents: consoleEvents.filter((e) => e.source === 'SCANNER').length,
        consoleBrowserEvents: consoleEvents.filter((e) => e.source === 'BROWSER').length,
        runtimeErrors: runtimeErrors.length,
        networkFailures: networkFailures.length,
        scannerBlockedRequests: scannerBlockedRequests.length,
        accessibilityViolations: accessibility.length,
        securityFindings: securityFindings.filter((s) => s.status === 'FAIL' || s.status === 'WARNING').length,
        brokenAssets: brokenResources.length,
        findings: findings.length,
        findingsCritical: findingsSummary.severity.critical,
        findingsError: findingsSummary.severity.error,
        findingsWarning: findingsSummary.severity.warning,
        findingsInfo: findingsSummary.severity.info,
      },
      scores,
      findings,
      findingsSummary,
      issues,
      pages,
      consoleEvents,
      runtimeErrors,
      networkEvents,
      networkFailures,
      scannerBlockedRequests,
      apiInventory: buildApiInventory(networkEvents),
      performance,
      accessibility,
      securityFindings,
      cookies: cookieFindings,
      sourceMaps,
      seoFindings,
      forms,
      brokenResources,
      brokenLinks,
      redirects,
      thirdParty,
      storage,
      webSockets,
      serviceWorker,
      pwa,
      screenshots,
    };

    return result;
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }

  function attachObservers(page: Page) {
    const atNetworkCap = () => networkEvents.length >= config.scanMaxRequests;

    page.on('console', (msg) => {
      if (consoleEvents.length >= config.scanMaxConsoleEvents) return;
      const loc = msg.location();
      const type = mapPlaywrightConsoleType(msg.type());
      const text = redactText(msg.text()).slice(0, 2_000);
      if (text.startsWith('[TRACE_UNHANDLED_REJECTION]')) {
        const rest = text.replace('[TRACE_UNHANDLED_REJECTION]', '').trim();
        if (runtimeErrors.length < config.scanMaxRuntimeErrors) {
          runtimeErrors.push({
            id: id(),
            message: rest.split('\n')[0] || rest,
            stack: rest.slice(0, 4_000),
            pageUrl: currentPageUrl,
            timestamp: nowIso(),
            type: 'unhandled_rejection',
          });
        }
        return;
      }
      const args: string[] = [];
      try {
        for (const a of msg.args()) {
          if (args.length >= 5) break;
          args.push(String(a).slice(0, 500));
        }
      } catch {
        /* not serializable */
      }
      const sourceUrl = loc.url || undefined;
      consoleEvents.push({
        id: id(),
        type,
        text,
        pageUrl: currentPageUrl,
        timestamp: nowIso(),
        sourceUrl,
        line: loc.lineNumber || undefined,
        column: loc.columnNumber || undefined,
        args: args.length ? args.map(redactText) : undefined,
        classification: 'RUNTIME_OBSERVED',
        source: classifyConsoleSource({ text, sourceUrl, pageUrl: currentPageUrl }),
      });
    });

    page.on('pageerror', (err) => {
      if (runtimeErrors.length >= config.scanMaxRuntimeErrors) return;
      const parsed = parseStack(err.stack ?? '');
      runtimeErrors.push({
        id: id(),
        message: err.message.slice(0, 2_000),
        stack: err.stack?.slice(0, 4_000),
        pageUrl: currentPageUrl,
        timestamp: nowIso(),
        sourceUrl: parsed.source,
        line: parsed.line,
        column: parsed.column,
        type: 'pageerror',
      });
    });

    page.on('crash', () => {
      if (runtimeErrors.length >= config.scanMaxRuntimeErrors) return;
      runtimeErrors.push({
        id: id(),
        message: 'Browser page crashed',
        pageUrl: currentPageUrl,
        timestamp: nowIso(),
        type: 'browser_crash',
      });
    });

    page.on('request', (req) => {
      requestStarts.set(req, Date.now());
      if (req.resourceType() === 'websocket' && webSockets.length < config.scanMaxRequests) {
        webSockets.push({
          url: redactUrl(req.url()),
          pageUrl: currentPageUrl,
          status: 'connected',
          duration: 0,
        });
      }
    });

    page.on('requestfailed', (req) => {
      if (atNetworkCap()) return;
      const start = requestStarts.get(req) ?? Date.now();
      requestStarts.delete(req);
      const duration = Date.now() - start;
      const failure = req.failure()?.errorText ?? 'request failed';
      const resourceType = mapResourceType(req.resourceType());
      const ev: NetworkEvent = {
        id: id(),
        url: redactUrl(req.url()),
        method: req.method(),
        resourceType,
        status: 0,
        requestHeaders: redactHeaders(req.headers()),
        responseHeaders: {},
        duration,
        pageUrl: currentPageUrl,
        failureReason: failure,
        isApi: resourceType === 'xhr' || resourceType === 'fetch' || resourceType === 'websocket',
        apiType: classifyApi({ resourceType, method: req.method(), url: req.url(), postData: req.postData() ?? undefined }).apiType,
      };
      networkEvents.push(ev);
      const blockedByTrace = wouldTraceBlockRequest(resourceType, req.url(), input.url);
      if (blockedByTrace) {
        if (scannerBlockedRequests.length < config.scanMaxRequests) {
          scannerBlockedRequests.push({
            id: id(),
            url: ev.url,
            method: ev.method,
            resourceType,
            reason: failure,
            pageUrl: currentPageUrl,
            duration,
          });
        }
        return;
      }
      if (
        isActionableNetworkFailure({
          status: 0,
          reason: failure,
          resourceType,
          url: ev.url,
          startUrl: input.url,
        }) &&
        networkFailures.length < config.scanMaxRequests
      ) {
        networkFailures.push({
          id: id(),
          url: ev.url,
          method: ev.method,
          status: 0,
          reason: failure,
          pageUrl: currentPageUrl,
          resourceType,
          duration,
        });
      }
    });

    page.on('response', async (res) => {
      if (atNetworkCap()) return;
      const req = res.request();
      const start = requestStarts.get(req) ?? Date.now();
      requestStarts.delete(req);
      const duration = Date.now() - start;
      const resourceType = mapResourceType(req.resourceType());
      const headers = redactHeaders(res.headers());
      const reqHeaders = redactHeaders(req.headers());
      const classified = classifyApi({
        resourceType,
        method: req.method(),
        contentType: res.headers()['content-type'],
        url: req.url(),
        postData: req.postData() ?? undefined,
      });
      const status = res.status();
      const ev: NetworkEvent = {
        id: id(),
        url: redactUrl(req.url()),
        method: req.method(),
        resourceType,
        status,
        statusText: res.statusText(),
        requestHeaders: reqHeaders,
        responseHeaders: headers,
        responseSize: Number(res.headers()['content-length']) || undefined,
        duration,
        pageUrl: currentPageUrl,
        initiator: req.frame()?.url(),
        isApi: classified.isApi,
        apiType: classified.apiType,
      };
      networkEvents.push(ev);
      if (classified.isApi) {
        const reqHost = hostOf(req.url());
        const startHost = hostOf(input.url);
        if (reqHost && startHost && isFirstPartyHost(reqHost, startHost)) {
          securityFindings.push(...analyzeCorsHeaders(res.headers(), req.url()));
        }
      }
      if (
        status >= 400 &&
        isActionableNetworkFailure({
          status,
          reason: `${status} ${res.statusText()}`,
          resourceType,
          url: ev.url,
          startUrl: input.url,
        }) &&
        networkFailures.length < config.scanMaxRequests
      ) {
        networkFailures.push({
          id: id(),
          url: ev.url,
          method: ev.method,
          status,
          reason: `${status} ${res.statusText()}`,
          pageUrl: currentPageUrl,
          resourceType,
          duration,
        });
      }
    });
  }
}

function headerMap(nav: { headers: () => Record<string, string> } | null): Record<string, string> {
  try {
    return nav?.headers() ?? {};
  } catch {
    return {};
  }
}

function parseStack(stack: string): { source?: string; line?: number; column?: number } {
  const m2 = stack.match(/(https?:\/\/\S+?):(\d+):(\d+)/);
  if (m2) return { source: m2[1], line: Number(m2[2]), column: Number(m2[3]) };
  return {};
}

function emptyPerf(): PerformanceMetrics {
  return {
    fcp: 'NOT AVAILABLE',
    lcp: 'NOT AVAILABLE',
    cls: 'NOT AVAILABLE',
    inp: 'NOT AVAILABLE',
    ttfb: 'NOT AVAILABLE',
    domContentLoaded: 'NOT AVAILABLE',
    loadTime: 'NOT AVAILABLE',
    longTasksCount: 0,
    totalTransferSizeBytes: 0,
    jsSizeBytes: 0,
    cssSizeBytes: 0,
    imageSizeBytes: 0,
    fontSizeBytes: 0,
    requestCount: 0,
  };
}

function applyResourceSizes(perf: PerformanceMetrics, events: NetworkEvent[]): PerformanceMetrics {
  const size = (t: string) => events.filter((e) => e.resourceType === t).reduce((a, b) => a + (b.responseSize ?? 0), 0);
  return {
    ...perf,
    jsSizeBytes: size('script'),
    cssSizeBytes: size('stylesheet'),
    imageSizeBytes: size('image'),
    fontSizeBytes: size('font'),
    totalTransferSizeBytes: events.reduce((a, b) => a + (b.responseSize ?? 0), 0),
    requestCount: events.length,
  };
}

function buildThirdParty(events: NetworkEvent[], startUrl: string): ThirdPartyDomain[] {
  const origin = originOf(startUrl);
  const map = new Map<string, ThirdPartyDomain>();
  for (const e of events) {
    const host = hostOf(e.url);
    const pageHost = hostOf(startUrl);
    if (!host || host === pageHost) continue;
    const rec = map.get(host) ?? { domain: host, requestCount: 0, resourceTypes: [], pages: [] };
    rec.requestCount += 1;
    if (!rec.resourceTypes.includes(e.resourceType)) rec.resourceTypes.push(e.resourceType);
    if (!rec.pages.includes(e.pageUrl)) rec.pages.push(e.pageUrl);
    map.set(host, rec);
  }
  void origin;
  return [...map.values()];
}

function normalizeOptions(o: ScanOptions) {
  const maxPages = Math.min(o.maxPages ?? config.scanMaxPages, config.scanHardMaxPages);
  const maxDepth = Math.min(o.maxDepth ?? config.scanMaxDepth, config.scanMaxDepth);
  return {
    maxPages: Math.max(1, maxPages),
    maxDepth: Math.max(0, maxDepth),
    timeout: o.timeout ?? config.scanPageTimeoutMs,
    device: o.device ?? 'mobile',
    interactions: o.interactions ?? false,
    accessibility: o.accessibility ?? true,
    performance: o.performance ?? true,
    security: o.security ?? true,
    activeProbing: o.activeProbing ?? false,
    maxDurationMs: config.scanMaxDurationMs,
  };
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8000) });
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.subarray(0, config.maxResponseBodyBytes).toString('utf8');
}

async function captureRedirects(url: string, out: RedirectChain[]) {
  const steps: RedirectChain['steps'] = [];
  let current = url;
  const seen = new Set<string>();
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) {
    if (seen.has(current)) {
      out.push({
        initialUrl: url,
        finalUrl: current,
        steps,
        isHttpsUpgrade: url.startsWith('http://') && current.startsWith('https://'),
        isLoop: true,
        isCrossDomain: hostOf(url) !== hostOf(current),
        totalTime: Date.now() - t0,
      });
      return;
    }
    seen.add(current);
    try {
      await assertSafeRedirect(current);
      const r = await safeHeadOrGet(current, 'GET');
      steps.push({ url: current, status: r.status, location: r.redirectedTo });
      if (r.status >= 300 && r.status < 400 && r.redirectedTo) {
        current = new URL(r.redirectedTo, current).toString();
        continue;
      }
      out.push({
        initialUrl: url,
        finalUrl: current,
        steps,
        isHttpsUpgrade: url.startsWith('http://') && current.startsWith('https://'),
        isLoop: false,
        isCrossDomain: hostOf(url) !== hostOf(current),
        totalTime: Date.now() - t0,
      });
      return;
    } catch {
      return;
    }
  }
}

async function safeInteract(page: Page) {
  try {
    const els = (await page.evaluate(`(${INTERACTIVE_ELEMENTS_SCRIPT})()`)) as Array<{
      index: number;
      text: string;
      visible: boolean;
    }>;
    let clicks = 0;
    for (const el of els) {
      if (clicks >= 8) break;
      if (!el.visible) continue;
      if (isDangerousControl(el.text)) continue;
      void DANGEROUS_CLICK;
      try {
        const locator = page.locator('button, a, [role="button"], [role="tab"], summary').nth(el.index);
        await locator.click({ timeout: 1000, trial: false });
        clicks += 1;
        await page.waitForTimeout(200);
      } catch {
        /* conservative: skip */
      }
    }
  } catch {
    /* ignore */
  }
}

async function probeLinks(startUrl: string, pageUrls: string[], opts: { timeout: number }) {
  void startUrl;
  void pageUrls;
  void opts;
}

async function collectBrokenLinks(
  pages: ScannedPageResult[],
  events: NetworkEvent[],
  startUrl: string,
  probing: boolean,
) {
  const docs = events.filter((e) => e.resourceType === 'document' && (e.status === 404 || e.status === 410 || e.status >= 500));
  const broken = docs.map((e) => ({
    url: e.url,
    sourcePageUrl: e.pageUrl,
    status: e.status,
    reason: e.failureReason ?? String(e.status),
  }));
  if (!probing) return broken;
  let probes = 0;
  for (const p of pages) {
    if (probes >= config.probeMaxRequests) break;
    if (!sameOrigin(startUrl, p.url)) continue;
    if (p.statusCode >= 400) {
      broken.push({ url: p.url, sourcePageUrl: p.url, status: p.statusCode, reason: String(p.statusCode) });
    }
    probes += 1;
  }
  return broken;
}

