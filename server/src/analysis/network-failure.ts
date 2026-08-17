import type { ResourceType } from '../../../src/server/types/scan-types.ts';
import { wouldTraceBlockRequest } from '../scanner/resource-blocking.ts';
import { isBenignRequestFailure } from './network.ts';

export interface NetworkFailureLike {
  status: number;
  reason?: string;
  resourceType: ResourceType;
  url: string;
  startUrl?: string;
}

/** Status-0 failures with explicit browser network error evidence (not scanner abort). */
export function hasConfirmedNetworkFailureEvidence(reason: string | undefined): boolean {
  if (!reason) return false;
  const r = reason.toLowerCase();
  return (
    r.includes('timed_out') ||
    r.includes('timeout') ||
    r.includes('err_timed_out') ||
    r.includes('name_not_resolved') ||
    r.includes('dns') ||
    r.includes('err_name_not_resolved') ||
    r.includes('cors') ||
    (r.includes('err_failed') && r.includes('access-control')) ||
    r.includes('connection_refused') ||
    r.includes('err_connection_refused') ||
    r.includes('connection_reset') ||
    r.includes('err_connection_reset') ||
    r.includes('internet_disconnected') ||
    r.includes('err_internet_disconnected') ||
    r.includes('network_changed')
  );
}

/** Request cancelled/blocked by TRACE or the browser — not a target-site failure. */
export function isTraceScannerArtifact(input: NetworkFailureLike): boolean {
  if (isBenignRequestFailure(input.reason)) return true;
  if (input.startUrl && wouldTraceBlockRequest(input.resourceType, input.url, input.startUrl)) {
    if (input.status === 0) return true;
    if (isBenignRequestFailure(input.reason)) return true;
  }
  return false;
}

/** Whether a failed request should become a user-facing website/network finding. */
export function isActionableNetworkFailure(input: NetworkFailureLike): boolean {
  if (isTraceScannerArtifact(input)) return false;
  if (input.status >= 400) return true;
  if (input.status === 0) return hasConfirmedNetworkFailureEvidence(input.reason);
  return false;
}

export function isActionableBrokenResource(input: {
  status: number;
  failureReason?: string;
  resourceType: ResourceType;
  url: string;
  startUrl?: string;
}): boolean {
  if (
    isTraceScannerArtifact({
      status: input.status,
      reason: input.failureReason,
      resourceType: input.resourceType,
      url: input.url,
      startUrl: input.startUrl,
    })
  ) {
    return false;
  }
  if (input.status === 404 || input.status === 410 || input.status >= 500) return true;
  if (input.status === 0) return hasConfirmedNetworkFailureEvidence(input.failureReason);
  return false;
}
