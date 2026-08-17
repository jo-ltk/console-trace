import type { ResourceType } from '../../../src/server/types/scan-types.ts';
import { hostOf, isFirstPartyHost } from '../url/normalize.ts';

/** Resource types TRACE always blocks to reduce memory and noise. */
export const TRACE_ALWAYS_BLOCKED_TYPES = new Set<ResourceType>(['media', 'font']);

/** Mirrors installResourceBlocking() — used to classify aborted/blocked requests. */
export function wouldTraceBlockRequest(resourceType: string, url: string, startUrl: string): boolean {
  if (TRACE_ALWAYS_BLOCKED_TYPES.has(resourceType as ResourceType)) return true;
  if (resourceType === 'image') {
    const startHost = hostOf(startUrl);
    const reqHost = hostOf(url);
    if (startHost && reqHost && !isFirstPartyHost(reqHost, startHost)) return true;
  }
  return false;
}
