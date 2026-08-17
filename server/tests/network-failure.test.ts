import { describe, expect, it } from 'vitest';
import {
  hasConfirmedNetworkFailureEvidence,
  isActionableBrokenResource,
  isActionableNetworkFailure,
  isTraceScannerArtifact,
} from '../src/analysis/network-failure.ts';

describe('network failure classification', () => {
  const startUrl = 'https://example.com/';

  it('treats TRACE-blocked third-party fonts as scanner artifacts', () => {
    expect(
      isTraceScannerArtifact({
        status: 0,
        reason: 'net::ERR_ABORTED',
        resourceType: 'font',
        url: 'https://fonts.gstatic.com/s/roboto.woff2',
        startUrl,
      }),
    ).toBe(true);
    expect(
      isActionableNetworkFailure({
        status: 0,
        reason: 'net::ERR_ABORTED',
        resourceType: 'font',
        url: 'https://fonts.gstatic.com/s/roboto.woff2',
        startUrl,
      }),
    ).toBe(false);
  });

  it('treats TRACE-blocked third-party images as scanner artifacts', () => {
    expect(
      isActionableNetworkFailure({
        status: 0,
        reason: 'net::ERR_ABORTED',
        resourceType: 'image',
        url: 'https://cdn.example.net/pixel.png',
        startUrl,
      }),
    ).toBe(false);
  });

  it('keeps first-party broken images as actionable assets', () => {
    expect(
      isActionableBrokenResource({
        status: 404,
        resourceType: 'image',
        url: 'https://example.com/missing.png',
        startUrl,
      }),
    ).toBe(true);
  });

  it('does not treat generic GET 0 without evidence as actionable', () => {
    expect(
      isActionableNetworkFailure({
        status: 0,
        reason: 'request failed',
        resourceType: 'fetch',
        url: 'https://example.com/api/data',
        startUrl,
      }),
    ).toBe(false);
  });

  it('keeps confirmed timeout and DNS failures', () => {
    expect(hasConfirmedNetworkFailureEvidence('net::ERR_TIMED_OUT')).toBe(true);
    expect(hasConfirmedNetworkFailureEvidence('net::ERR_NAME_NOT_RESOLVED')).toBe(true);
    expect(
      isActionableNetworkFailure({
        status: 0,
        reason: 'net::ERR_TIMED_OUT',
        resourceType: 'fetch',
        url: 'https://example.com/api/slow',
        startUrl,
      }),
    ).toBe(true);
  });

  it('keeps real HTTP 4xx/5xx responses', () => {
    expect(
      isActionableNetworkFailure({
        status: 500,
        reason: '500 Internal Server Error',
        resourceType: 'fetch',
        url: 'https://example.com/api/fail',
        startUrl,
      }),
    ).toBe(true);
    expect(
      isActionableNetworkFailure({
        status: 404,
        reason: '404 Not Found',
        resourceType: 'document',
        url: 'https://example.com/missing',
        startUrl,
      }),
    ).toBe(true);
  });

  it('excludes blocked third-party assets with status 0 from broken resource findings', () => {
    expect(
      isActionableBrokenResource({
        status: 0,
        failureReason: 'net::ERR_ABORTED',
        resourceType: 'media',
        url: 'https://videos.example.net/clip.mp4',
        startUrl,
      }),
    ).toBe(false);
  });
});

describe('findings pipeline filters scanner artifacts', () => {
  it('does not create network findings for blocked third-party fonts', async () => {
    const { buildFindings } = await import('../src/findings/pipeline.ts');
    const findings = buildFindings({
      scanId: 'scan-1',
      targetUrl: 'https://example.com/',
      pages: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          url: 'https://example.com/',
          title: 't',
          status: 'healthy',
          statusCode: 200,
          issuesCount: 0,
          duration: 10,
          depth: 0,
        },
      ],
      consoleEvents: [],
      runtimeErrors: [],
      networkFailures: [
        {
          id: 'n1',
          url: 'https://fonts.gstatic.com/font.woff2',
          method: 'GET',
          status: 0,
          reason: 'net::ERR_ABORTED',
          pageUrl: 'https://example.com/',
          resourceType: 'font',
          duration: 12,
        },
      ],
      brokenResources: [
        {
          url: 'https://fonts.gstatic.com/font.woff2',
          pageUrl: 'https://example.com/',
          resourceType: 'font',
          status: 0,
          error: 'net::ERR_ABORTED',
        },
      ],
      brokenLinks: [],
      accessibility: [],
      securityFindings: [],
      seoFindings: [],
      performance: {
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
      },
    });
    expect(findings.some((f) => f.category === 'network' || f.category === 'assets')).toBe(false);
  });
});
