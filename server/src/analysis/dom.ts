import type { FormFinding, SeoFinding, IssueSeverity } from '../../../src/server/types/scan-types.ts';

export interface DomExtract {
  title?: string;
  lang?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  robotsMeta?: string;
  h1Count: number;
  ogTags: Record<string, string>;
  twitterTags: Record<string, string>;
  forms: FormFinding[];
  links: string[];
  manifestUrl?: string;
  themeColor?: string;
}

export function seoFromExtract(pageUrl: string, d: DomExtract): SeoFinding {
  const issues: { severity: IssueSeverity; message: string }[] = [];
  if (!d.title) issues.push({ severity: 'ERROR', message: 'Missing title' });
  if (!d.metaDescription) issues.push({ severity: 'WARNING', message: 'Missing meta description' });
  if (!d.canonicalUrl) issues.push({ severity: 'INFO', message: 'Missing canonical' });
  if (!d.lang) issues.push({ severity: 'WARNING', message: 'Missing html lang' });
  if (d.h1Count === 0) issues.push({ severity: 'WARNING', message: 'Missing H1' });
  return {
    pageUrl,
    title: d.title,
    metaDescription: d.metaDescription,
    canonicalUrl: d.canonicalUrl,
    lang: d.lang,
    robotsMeta: d.robotsMeta,
    hasH1: d.h1Count > 0,
    h1Count: d.h1Count,
    ogTags: d.ogTags,
    twitterTags: d.twitterTags,
    issues,
  };
}

export const DOM_EXTRACT_SCRIPT = `() => {
  const attr = (sel, name) => document.querySelector(sel)?.getAttribute(name) || undefined;
  const content = (sel) => document.querySelector(sel)?.getAttribute('content') || undefined;
  const og = {};
  document.querySelectorAll('meta[property^="og:"]').forEach((m) => {
    const p = m.getAttribute('property');
    const c = m.getAttribute('content');
    if (p && c) og[p] = c;
  });
  const tw = {};
  document.querySelectorAll('meta[name^="twitter:"]').forEach((m) => {
    const n = m.getAttribute('name');
    const c = m.getAttribute('content');
    if (n && c) tw[n] = c;
  });
  const forms = [...document.querySelectorAll('form')].map((form) => {
    const fields = [...form.querySelectorAll('input,select,textarea')].map((el) => {
      const id = el.getAttribute('id');
      const labelEl = id ? document.querySelector('label[for="'+id+'"]') : el.closest('label');
      return {
        name: el.getAttribute('name') || '',
        type: el.getAttribute('type') || el.tagName.toLowerCase(),
        required: el.hasAttribute('required'),
        autocomplete: el.getAttribute('autocomplete') || undefined,
        hasLabel: Boolean(labelEl),
        labelContent: labelEl ? labelEl.textContent.trim() : undefined,
        hasAriaLabel: Boolean(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')),
        id: id || undefined,
      };
    });
    const issues = [];
    for (const f of fields) {
      if (!f.hasLabel && !f.hasAriaLabel && f.type !== 'hidden' && f.type !== 'submit') issues.push('Field "'+(f.name||f.id||f.type)+'" missing label');
      if (f.type === 'password' && !f.autocomplete) issues.push('Password field without autocomplete');
    }
    return {
      pageUrl: location.href,
      action: form.getAttribute('action') || '',
      method: (form.getAttribute('method') || 'GET').toUpperCase(),
      fields,
      issues,
    };
  });
  const links = [...document.querySelectorAll('a[href]')].map((a) => a.href);
  return {
    title: document.title || undefined,
    lang: document.documentElement.lang || undefined,
    metaDescription: content('meta[name="description"]'),
    canonicalUrl: attr('link[rel="canonical"]', 'href'),
    robotsMeta: content('meta[name="robots"]'),
    h1Count: document.querySelectorAll('h1').length,
    ogTags: og,
    twitterTags: tw,
    forms,
    links,
    manifestUrl: attr('link[rel="manifest"]', 'href'),
    themeColor: content('meta[name="theme-color"]'),
  };
}`;

export const STORAGE_SCRIPT = `() => {
  const localKeys = Object.keys(localStorage || {});
  const sessionKeys = Object.keys(sessionStorage || {});
  const tokenKeys = [...localKeys, ...sessionKeys].filter((k) =>
    /token|jwt|session|auth|password|secret|apikey|api_key/i.test(k)
  );
  return {
    localStorageKeys: localKeys,
    sessionStorageKeys: sessionKeys,
    indexedDbNames: [],
    hasDetectedToken: tokenKeys.length > 0,
    tokenLocations: tokenKeys.map((k) => (localKeys.includes(k) ? 'localStorage' : 'sessionStorage')),
  };
}`;

export const PERF_SCRIPT = `() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const paints = performance.getEntriesByType('paint');
  const fcpEntry = paints.find((p) => p.name === 'first-contentful-paint');
  const lcpList = performance.getEntriesByType('largest-contentful-paint');
  const lcp = lcpList.length ? lcpList[lcpList.length - 1].startTime : undefined;
  const clsList = performance.getEntriesByType('layout-shift');
  let cls = 0;
  for (const e of clsList) {
    if (!e.hadRecentInput) cls += e.value;
  }
  const longTasks = performance.getEntriesByType('longtask');
  const observedLcp = typeof window.__TRACE_LCP === 'number' ? window.__TRACE_LCP : null;
  return {
    fcp: fcpEntry ? Math.round(fcpEntry.startTime) : null,
    lcp: lcp != null ? Math.round(lcp) : (observedLcp != null ? Math.round(observedLcp) : null),
    observedLcp: observedLcp != null ? Math.round(observedLcp) : null,
    cls: Number(cls.toFixed(4)),
    ttfb: nav ? Math.round(nav.responseStart) : null,
    domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
    loadTime: nav ? Math.round(nav.loadEventEnd) : null,
    longTasksCount: longTasks.length,
  };
}`;

export const INTERACTIVE_ELEMENTS_SCRIPT = `() => {
  const els = [...document.querySelectorAll('button, a, [role="button"], [role="tab"], summary')];
  return els.slice(0, 80).map((el, i) => {
    const text = (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 80);
    const rect = el.getBoundingClientRect();
    return { index: i, tag: el.tagName, text, href: el.getAttribute('href'), visible: rect.width > 0 && rect.height > 0 };
  });
}`;

export const DANGEROUS_CLICK = [
  'delete',
  'remove',
  'purchase',
  'buy',
  'pay',
  'submit payment',
  'confirm order',
  'send',
  'transfer',
  'change password',
  'delete account',
  'logout',
  'log out',
  'sign out',
  'approve',
  'reject',
  'publish',
  'create account',
  'sign up',
  'register',
  'checkout',
];

export function isDangerousControl(text: string): boolean {
  const t = text.toLowerCase().trim();
  return DANGEROUS_CLICK.some((w) => t === w || t.includes(w));
}
