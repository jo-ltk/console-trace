import { migrate, pool } from '../db/pool.ts';
import { closeQueueInfrastructure, createScanWorker } from '../queue/queues.ts';
import { log } from '../log.ts';
import { assertProductionEnv } from '../config.ts';
import { onShutdown } from '../process/shutdown.ts';

async function main() {
  assertProductionEnv();
  await migrate();
  const worker = createScanWorker();
  log.info('worker_started', {});
  onShutdown(async () => {
    await closeQueueInfrastructure(worker);
    await pool.end();
  });
}

main().catch((err) => {
  log.error('worker_start_failed', { error: (err as Error).message });
  process.exit(1);
});
