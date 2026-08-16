import { startApi } from '../api/index.ts';
import { migrate } from '../db/pool.ts';
import { createScanWorker } from '../queue/queues.ts';
import { log } from '../log.ts';

async function main() {
  await migrate();
  createScanWorker();
  log.info('worker_started', {});
  await startApi();
}

main().catch((err) => {
  log.error('stack_start_failed', { error: (err as Error).message });
  process.exit(1);
});
