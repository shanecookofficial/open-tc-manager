#!/bin/sh
set -eu

echo "entrypoint: running database migrations"
node /app/scripts/migrate.mjs

if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  echo "entrypoint: SEED_DEMO_DATA=true — loading demo data"
  node /app/dist/seed.cjs
fi

exec "$@"
