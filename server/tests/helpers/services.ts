import pg from 'pg';
import IORedis from 'ioredis';

const DEFAULT_DATABASE_URL = 'postgres://trace:trace@localhost:5432/trace';
const DEFAULT_REDIS_URL = 'redis://localhost:6379';

export function integrationEnv(): { databaseUrl: string; redisUrl: string } {
  return {
    databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    redisUrl: process.env.REDIS_URL ?? DEFAULT_REDIS_URL,
  };
}

export async function servicesAvailable(): Promise<boolean> {
  const { databaseUrl, redisUrl } = integrationEnv();
  let pgPool: pg.Pool | undefined;
  let redis: IORedis | undefined;
  try {
    pgPool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 });
    await pgPool.query('SELECT 1');
    redis = new IORedis(redisUrl, { connectTimeout: 3000, maxRetriesPerRequest: 1, lazyConnect: true });
    await redis.connect();
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  } finally {
    await pgPool?.end().catch(() => undefined);
    await redis?.quit().catch(() => undefined);
  }
}

export function applyIntegrationEnv(): void {
  const { databaseUrl, redisUrl } = integrationEnv();
  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_URL = redisUrl;
}
