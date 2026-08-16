import type { FindingCategory } from '../../../src/server/types/scan-types.ts';

export function recommendationFor(kind: string, ctx: Record<string, unknown>): string {
  switch (kind) {
    case 'console_error':
      return 'Inspect the originating script and remove or handle the error path that calls console.error.';
    case 'console_warn':
      return 'Review the warning on the target page and fix the underlying condition.';
    case 'console_excess_log':
      return 'Reduce diagnostic console.log/debug output in production builds.';
    case 'runtime_pageerror':
    case 'runtime_uncaught_exception':
    case 'runtime_unhandled_rejection':
      return 'Inspect the stack trace and reproduce the failing execution path.';
    case 'runtime_browser_crash':
      return 'Reproduce the page in a local browser and inspect crash logs; the page process exited during the scan.';
    case 'runtime_execution_failure':
      return 'Confirm the page loads within the scan timeout and is reachable from the crawler.';
    case 'network_5xx':
      return 'Inspect the server-side endpoint and its error logs.';
    case 'network_404':
    case 'network_4xx':
      return 'Verify the URL, routing, and whether the resource is expected to exist.';
    case 'network_403':
      return 'Confirm whether the request should be authenticated or publicly reachable.';
    case 'network_timeout':
      return 'Inspect server latency and timeouts for this request.';
    case 'network_dns':
      return 'Verify the hostname resolves and is spelled correctly.';
    case 'network_cors':
      return 'Align Access-Control-Allow-Origin with the requesting origin, or avoid credentialed cross-origin calls.';
    case 'network_failed':
      return 'Inspect the failure reason and whether the host is reachable.';
    case 'asset_broken':
      return 'Verify the asset path and ensure the file is included in the production build.';
    case 'broken_link':
      return 'Update or remove the internal link, or restore the destination page.';
    case 'a11y_critical':
    case 'a11y_serious':
    case 'a11y_moderate':
    case 'a11y_minor':
      return a11yRecommendation(String(ctx.rule ?? ''), String(ctx.help ?? ''));
    case 'perf_needs_improvement':
    case 'perf_poor':
      return perfRecommendation(String(ctx.metric ?? ''));
    case 'security_fail':
    case 'security_warning':
    case 'security_info':
      return securityRecommendation(String(ctx.name ?? ''));
    case 'seo_error':
    case 'seo_warning':
    case 'seo_info':
      return seoRecommendation(String(ctx.message ?? ''));
    default:
      return 'Inspect the evidence and the originating page.';
  }
}

export function whyItMatters(kind: string, ctx: Record<string, unknown>): string {
  switch (kind) {
    case 'console_error':
      return 'The target site called console.error during page execution.';
    case 'console_warn':
      return 'The target site called console.warn during page execution.';
    case 'console_excess_log':
      return 'High volume of TARGET console.log/debug output was observed.';
    case 'runtime_pageerror':
    case 'runtime_uncaught_exception':
      return 'The browser reported an uncaught JavaScript exception.';
    case 'runtime_unhandled_rejection':
      return 'A promise was rejected without an attached rejection handler.';
    case 'runtime_browser_crash':
      return 'The browser page process crashed while loading this URL.';
    case 'runtime_execution_failure':
      return 'The scanner could not finish loading this page.';
    case 'network_5xx':
      return 'The browser received a server error from this endpoint.';
    case 'network_404':
      return 'The browser requested a URL that the server reported as missing.';
    case 'network_403':
      return 'The server refused this request.';
    case 'network_4xx':
      return 'The server returned a client error status for this request.';
    case 'network_timeout':
      return 'The request did not complete before the timeout.';
    case 'network_dns':
      return 'The hostname could not be resolved.';
    case 'network_cors':
      return 'The browser blocked this request due to CORS.';
    case 'network_failed':
      return 'The browser failed to complete this network request.';
    case 'asset_broken':
      return `The page referenced ${article(String(ctx.resourceType ?? 'resource'))} ${String(ctx.resourceType ?? 'resource')} that did not load.`;
    case 'broken_link':
      return 'The crawl followed an internal link to a failing page.';
    case 'a11y_critical':
    case 'a11y_serious':
    case 'a11y_moderate':
    case 'a11y_minor':
      return String(ctx.description ?? 'axe-core reported this accessibility violation.');
    case 'perf_needs_improvement':
    case 'perf_poor':
      return `${String(ctx.metric ?? 'A performance metric')} crossed the documented threshold.`;
    case 'security_fail':
    case 'security_warning':
    case 'security_info':
      return String(ctx.evidence ?? 'A security-related response condition was observed.');
    case 'seo_error':
    case 'seo_warning':
    case 'seo_info':
      return String(ctx.message ?? 'An SEO observation was recorded from the document.');
    default:
      return 'This condition was observed in the scan evidence.';
  }
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

function a11yRecommendation(rule: string, help: string): string {
  if (rule === 'label' || rule === 'label-title-only') {
    return 'Associate the input with a visible label or appropriate accessible name.';
  }
  if (rule === 'image-alt') {
    return 'Add meaningful alternative text or mark the image decorative where appropriate.';
  }
  if (rule === 'button-name') {
    return 'Give the button an accessible name (visible text or aria-label).';
  }
  if (help) return help;
  return 'Follow the axe-core help URL for this rule.';
}

function perfRecommendation(metric: string): string {
  if (metric === 'lcp') return 'Reduce largest-contentful-paint by optimizing the main image/text render path.';
  if (metric === 'fcp') return 'Reduce first-contentful-paint by limiting render-blocking resources.';
  if (metric === 'cls') return 'Reserve space for images and embeds to reduce layout shift.';
  if (metric === 'ttfb') return 'Inspect origin/TTFB: server time to first byte exceeded the documented threshold.';
  return 'Inspect the measured metric against the documented threshold.';
}

function securityRecommendation(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('content-security-policy')) {
    return 'Add a restrictive Content-Security-Policy appropriate for the application.';
  }
  if (n.includes('strict-transport-security')) {
    return 'Send Strict-Transport-Security on HTTPS responses with a long max-age.';
  }
  if (n.includes('x-content-type-options')) {
    return 'Send X-Content-Type-Options: nosniff on responses.';
  }
  if (n.includes('cookie')) {
    return 'Set Secure, HttpOnly, and an explicit SameSite on session cookies.';
  }
  if (n.includes('mixed content')) {
    return 'Serve the resource over HTTPS or remove the HTTP subresource.';
  }
  if (n.includes('source map')) {
    return 'Do not expose production source maps on a public origin.';
  }
  if (n.includes('https')) {
    return 'Serve the site over HTTPS.';
  }
  return 'Review the observed header or cookie configuration against the evidence.';
}

function seoRecommendation(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('title')) return 'Add a unique, descriptive document title.';
  if (m.includes('meta description')) return 'Add a meta description for this page.';
  if (m.includes('canonical')) return 'Add a canonical URL when duplicate URLs exist.';
  if (m.includes('lang')) return 'Set the html lang attribute to the page language.';
  if (m.includes('h1')) return 'Include a single descriptive H1 that matches the page topic.';
  return 'Address the SEO observation recorded from the document.';
}

export function categoryLabel(category: FindingCategory): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}
