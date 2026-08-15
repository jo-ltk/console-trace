export const metrics = {
  activeScans: 0,
  scansStarted: 0,
  scansCompleted: 0,
  scansFailed: 0,
  browserCrashes: 0,
  totalScanDurationMs: 0,
  totalPages: 0,
  totalRequests: 0,
  lastQueueDepth: 0,
  memoryRss: 0,
};

export function snapshotMetrics() {
  const mem = process.memoryUsage();
  metrics.memoryRss = mem.rss;
  return {
    ...metrics,
    avgScanDurationMs:
      metrics.scansCompleted > 0 ? Math.round(metrics.totalScanDurationMs / metrics.scansCompleted) : 0,
    avgPagesPerScan: metrics.scansCompleted > 0 ? metrics.totalPages / metrics.scansCompleted : 0,
    avgRequestsPerScan: metrics.scansCompleted > 0 ? metrics.totalRequests / metrics.scansCompleted : 0,
    heapUsed: mem.heapUsed,
    rss: mem.rss,
    cpuUsage: process.cpuUsage(),
  };
}
