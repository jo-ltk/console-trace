import { migrate } from '../db/pool.ts';
import { createScanWorker } from '../queue/queues.ts';
import { log } from '../log.ts';

async function main() {
  await migrate();
  createScanWorker();
  log.info('worker_started', {});
}

main().catch((err) => {
  log.error('worker_start_failed', { error: (err as Error).message });
  process.exit(1);
});
