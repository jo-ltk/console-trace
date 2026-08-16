export type ConsoleSource = 'TARGET' | 'SCANNER' | 'BROWSER';

const SCANNER_TEXT = [
  /^\[TRACE_/,
  /TRACE_UNHANDLED_REJECTION/,
  /Deprecated API for given entry type/i,
];

const BROWSER_TEXT = [
  /^Failed to load resource/i,
  /^Net::ERR_/i,
  /^Refused to (connect|display|load|execute)/i,
];

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Attribute a Playwright console message to the scanned site, TRACE itself, or the browser.
 * Scanner/browser noise must not be scored as website console problems.
 */
export function classifyConsoleSource(input: {
  text: string;
  sourceUrl?: string;
  pageUrl: string;
}): ConsoleSource {
  const text = input.text.trim();
  if (SCANNER_TEXT.some((re) => re.test(text))) return 'SCANNER';
  if (BROWSER_TEXT.some((re) => re.test(text))) return 'BROWSER';

  const src = (input.sourceUrl ?? '').trim();
  if (
    src.startsWith('pptr:') ||
    src.startsWith('playwright://') ||
    src.includes('__playwright') ||
    src.includes('/playwright/')
  ) {
    return 'SCANNER';
  }
  if (
    src.startsWith('chrome-extension:') ||
    src.startsWith('chrome://') ||
    src.startsWith('devtools://') ||
    src.startsWith('edge://')
  ) {
    return 'BROWSER';
  }

  const pageOrigin = originOf(input.pageUrl);
  const srcOrigin = src ? originOf(src) : null;
  if (src && pageOrigin && srcOrigin && srcOrigin === pageOrigin) return 'TARGET';
  if (!src || src === 'about:blank') return 'TARGET';
  return 'BROWSER';
}

export function isTargetConsoleEvent(source: ConsoleSource | undefined): boolean {
  return (source ?? 'TARGET') === 'TARGET';
}

/** Playwright uses "warning"; TRACE stores "warn". */
export function mapPlaywrightConsoleType(
  t: string,
): 'log' | 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'dir' | 'table' | 'assert' | 'clear' {
  if (t === 'warning') return 'warn';
  const allowed = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table', 'assert', 'clear'] as const;
  return (allowed as readonly string[]).includes(t) ? (t as (typeof allowed)[number]) : 'log';
}
