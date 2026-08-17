import { chromium, devices, type Browser, type BrowserContext, type BrowserContextOptions } from 'playwright';
import type { ScanDevice } from '../../../src/server/types/scan-types.ts';
import { config } from '../config.ts';
import { log } from '../log.ts';
import { hostOf, isFirstPartyHost } from '../url/normalize.ts';

const TRACE_SUFFIX = ' TRACE/1.0';

/** Always blocked — high memory, not needed for runtime/network/a11y checks. */
const ALWAYS_BLOCKED = new Set(['media', 'font']);

export interface BrowserFactoryOptions {
  device?: ScanDevice;
  timeout?: number;
}

export async function launchBrowser(): Promise<Browser> {
  log.info('chromium_launching', {});
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--mute-audio',
      '--no-first-run',
      '--disable-sync',
    ],
  });
  log.info('chromium_launched', { version: browser.version() });
  return browser;
}

export function contextOptions(opts: BrowserFactoryOptions): BrowserContextOptions {
  const device = opts.device ?? 'mobile';
  if (device === 'desktop') {
    return {
      viewport: { width: 1440, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' +
        TRACE_SUFFIX,
      isMobile: false,
      hasTouch: false,
      javaScriptEnabled: true,
      ignoreHTTPSErrors: false,
      serviceWorkers: 'allow',
    };
  }
  const pixel = devices['Pixel 7'];
  return {
    ...pixel,
    userAgent: (pixel.userAgent ?? '') + TRACE_SUFFIX,
    javaScriptEnabled: true,
    ignoreHTTPSErrors: false,
    serviceWorkers: 'allow',
  };
}

export async function installResourceBlocking(context: BrowserContext, startUrl: string): Promise<void> {
  const startHost = hostOf(startUrl);
  await context.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (ALWAYS_BLOCKED.has(type)) {
      return route.abort();
    }
    // Block third-party images (major memory saver on large sites); keep first-party for broken-asset checks.
    if (type === 'image' && startHost) {
      const reqHost = hostOf(route.request().url());
      if (reqHost && !isFirstPartyHost(reqHost, startHost)) {
        return route.abort();
      }
    }
    return route.continue();
  });
}

export async function createScanContext(
  browser: Browser,
  opts: BrowserFactoryOptions & { startUrl?: string },
): Promise<BrowserContext> {
  const context = await browser.newContext(contextOptions(opts));
  context.setDefaultTimeout(opts.timeout ?? config.scanPageTimeoutMs);
  context.setDefaultNavigationTimeout(opts.timeout ?? config.scanPageTimeoutMs);
  if (opts.startUrl) {
    await installResourceBlocking(context, opts.startUrl);
  }
  return context;
}
