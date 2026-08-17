import { api, type ScanStatusResponse } from '../services/api';

const TERMINAL = new Set(['completed', 'completed_with_warnings', 'failed', 'cancelled']);

export interface PollScanOptions {
  scanId: string;
  onStatus: (status: ScanStatusResponse) => void;
  onError?: (error: Error, consecutiveFailures: number) => void;
  shouldCancel?: () => boolean;
  /** Healthy poll interval (ms). Default 2500. */
  intervalMs?: number;
  /** Max consecutive failures before abort. Default 40 (~2 min with backoff). */
  maxFailures?: number;
}

function isTransientError(err: unknown): boolean {
  const msg = (err as Error).message || '';
  return /502|503|504|429|timeout|network|fetch failed/i.test(msg);
}

function backoffMs(consecutiveFailures: number, baseMs: number): number {
  const exp = Math.min(consecutiveFailures, 5);
  return Math.min(baseMs * 2 ** exp, 15000);
}

/** Poll scan status with backoff; avoids overlapping requests. */
export async function pollScanStatus(options: PollScanOptions): Promise<ScanStatusResponse> {
  const {
    scanId,
    onStatus,
    onError,
    shouldCancel,
    intervalMs = 2500,
    maxFailures = 40,
  } = options;

  let consecutiveFailures = 0;

  while (!shouldCancel?.()) {
    try {
      const st = await api.getStatus(scanId);
      consecutiveFailures = 0;
      onStatus(st);
      if (TERMINAL.has(st.status)) return st;
      await sleep(intervalMs);
    } catch (err) {
      consecutiveFailures += 1;
      onError?.(err as Error, consecutiveFailures);
      if (consecutiveFailures >= maxFailures) {
        throw new Error(
          `Lost connection to scan status after ${maxFailures} attempts. The scan may still be running — check History or retry.`,
        );
      }
      const wait = isTransientError(err) ? backoffMs(consecutiveFailures, intervalMs) : intervalMs;
      await sleep(wait);
    }
  }

  throw new Error('Polling cancelled');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
