import { chromium, devices, type Browser, type BrowserContext, type BrowserContextOptions } from 'playwright';
import type { ScanDevice } from '../../../src/server/types/scan-types.ts';
import { config } from '../config.ts';

const TRACE_SUFFIX = ' TRACE/1.0';

export interface BrowserFactoryOptions {
  device?: ScanDevice;
  timeout?: number;
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });
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

export async function createScanContext(
  browser: Browser,
  opts: BrowserFactoryOptions,
): Promise<BrowserContext> {
  const context = await browser.newContext(contextOptions(opts));
  context.setDefaultTimeout(opts.timeout ?? config.scanPageTimeoutMs);
  context.setDefaultNavigationTimeout(opts.timeout ?? config.scanPageTimeoutMs);
  return context;
}
