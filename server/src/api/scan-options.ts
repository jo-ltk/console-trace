import { config } from '../config.ts';
import type { ScanOptions } from '../../../src/server/types/scan-types.ts';

/** Clamp client-provided scan options to server memory-safe limits. */
export function clampScanOptions(options: ScanOptions = {}): ScanOptions {
  const maxPages = Math.min(options.maxPages ?? config.scanMaxPages, config.scanHardMaxPages);
  const maxDepth = Math.min(options.maxDepth ?? config.scanMaxDepth, config.scanMaxDepth);
  return {
    ...options,
    maxPages: Math.max(1, maxPages),
    maxDepth: Math.max(0, maxDepth),
  };
}
