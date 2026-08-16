import { startApi } from '../api/index.ts';
import { pool } from '../db/pool.ts';
import { closeQueueInfrastructure, createScanWorker } from '../queue/queues.ts';
import { log } from '../log.ts';
import { onShutdown } from '../process/shutdown.ts';

async function main() {
  const worker = createScanWorker();
  log.info('worker_started', {});
  const app = await startApi({ manageShutdown: false });
  onShutdown(async () => {
    await app.close();
    await closeQueueInfrastructure(worker);
    await pool.end();
  });
}

main().catch((err) => {
  log.error('stack_start_failed', { error: (err as Error).message });
  process.exit(1);
});
