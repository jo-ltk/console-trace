import { migrate, pool } from './pool.ts';

async function main() {
  await migrate();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
