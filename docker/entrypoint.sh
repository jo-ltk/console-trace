#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] waiting for database..."
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if npx tsx server/src/db/migrate.ts; then
      echo "[entrypoint] migrations complete"
      break
    fi
    echo "[entrypoint] migrate attempt $i failed, retrying in 3s..."
    sleep 3
    if [ "$i" -eq 15 ]; then
      echo "[entrypoint] migrations failed after retries"
      exit 1
    fi
  done
fi

exec "$@"
