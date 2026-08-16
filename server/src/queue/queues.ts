import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config.ts';
import { log } from '../log.ts';
import { metrics } from '../metrics.ts';
import { completeScan, failScan, updateScanStatus } from '../db/scans.ts';
import { runScanEngine } from '../scanner/engine.ts';
import { writeArtifacts } from '../artifacts/write.ts';
import type { ScanOptions, ScanStatus } from '../../../src/server/types/scan-types.ts';

let _connection: IORedis | undefined;
let _scanQueue: Queue | undefined;

export function getRedis(): IORedis {
  if (!_connection) {
    const tls = config.redisUrl.startsWith('rediss://') ? {} : undefined;
    _connection = new IORedis(config.redisUrl, {
      maxRetriesPerRequest: null,
      family: 0,
      tls,
    });
  }
  return _connection;
}

export function scanQueue() {
  if (!_scanQueue) {
    _scanQueue = new Queue('scan', { connection: getRedis() });
  }
  return _scanQueue;
}

const cancelKey = (id: string) => `scan:cancel:${id}`;
const progressKey = (id: string) => `scan:progress:${id}`;

export async function enqueueScan(scanId: string, url: string, options: ScanOptions) {
  await scanQueue().add(
    'run',
    { scanId, url, options },
    {
      jobId: scanId,
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 200 },
    },
  );
}

export async function requestCancel(scanId: string) {
  const connection = getRedis();
  await connection.set(cancelKey(scanId), '1', 'EX', 3600);
  const job = await scanQueue().getJob(scanId);
  if (job && (await job.getState()) === 'waiting') {
    await job.remove();
  }
}

export async function isCancelled(scanId: string): Promise<boolean> {
  return (await getRedis().get(cancelKey(scanId))) === '1';
}

export async function publishProgress(scanId: string, status: ScanStatus, extra?: Record<string, unknown>) {
  const connection = getRedis();
  const payload = JSON.stringify({ status, extra, ts: Date.now() });
  await connection.set(progressKey(scanId), payload, 'EX', 3600);
  await connection.publish(`scan:${scanId}:progress`, payload);
}

export function createScanWorker() {
  const worker = new Worker(
    'scan',
    async (job: Job<{ scanId: string; url: string; options: ScanOptions }>) => {
      const { scanId, url, options } = job.data;
      metrics.activeScans += 1;
      metrics.scansStarted += 1;
      const t0 = Date.now();
      log.info('scan_job_start', { scanId, jobId: job.id, pageUrl: url });
      try {
        if (await isCancelled(scanId)) {
          await updateScanStatus(scanId, 'cancelled', { reason: 'Cancelled before start' });
          return;
        }
        await updateScanStatus(scanId, 'launching_browser', { startedAt: new Date() });
        const result = await runScanEngine({
          scanId,
          url,
          options,
          onProgress: async (status) => {
            await updateScanStatus(scanId, status);
            await publishProgress(scanId, status);
            await job.updateProgress({ status });
          },
          shouldCancel: () => isCancelled(scanId),
        });
        await completeScan(scanId, result);
        try {
          await writeArtifacts(scanId, result);
        } catch (err) {
          log.warn('artifact_write_failed', { scanId, error: (err as Error).message });
        }
        metrics.scansCompleted += 1;
        metrics.totalScanDurationMs += result.scan.durationMs;
        metrics.totalPages += result.pages.length;
        metrics.totalRequests += result.networkEvents.length;
        log.info('scan_job_complete', { scanId, duration: Date.now() - t0 });
      } catch (err) {
        const message = (err as Error).message;
        if (message.toLowerCase().includes('crash')) metrics.browserCrashes += 1;
        metrics.scansFailed += 1;
        log.error('scan_job_failed', { scanId, error: message });
        await failScan(scanId, message);
        throw err;
      } finally {
        metrics.activeScans = Math.max(0, metrics.activeScans - 1);
      }
    },
    {
      connection: getRedis(),
      concurrency: config.browserConcurrency,
      lockDuration: config.scanMaxDurationMs + 60_000,
    },
  );

  worker.on('failed', (job, err) => {
    log.error('scan_worker_failed', { jobId: job?.id, error: err.message });
  });

  worker.on('ready', () => {
    log.info('worker_ready', { queue: 'scan' });
  });

  const beat = async () => {
    try {
      await getRedis().set('trace:worker:heartbeat', String(Date.now()), 'EX', 45);
    } catch (err) {
      log.warn('worker_heartbeat_failed', { error: (err as Error).message });
    }
  };
  void beat();
  const beatTimer = setInterval(() => void beat(), 15_000);
  if (typeof beatTimer.unref === 'function') beatTimer.unref();

  worker.on('closed', () => {
    clearInterval(beatTimer);
  });

  return worker;
}

export async function closeQueueInfrastructure(worker?: Worker): Promise<void> {
  if (worker) await worker.close();
  if (_scanQueue) {
    await _scanQueue.close();
    _scanQueue = undefined;
  }
  if (_connection) {
    await _connection.quit();
    _connection = undefined;
  }
}

export { getRedis as connection };
