import { log } from '../log.ts';

export function onShutdown(fn: () => Promise<void>): void {
  let stopping = false;
  const run = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info('shutdown', { signal });
    try {
      await fn();
      process.exit(0);
    } catch (err) {
      log.error('shutdown_failed', { error: (err as Error).message });
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void run('SIGTERM'));
  process.on('SIGINT', () => void run('SIGINT'));
}
