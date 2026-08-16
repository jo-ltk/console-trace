#!/bin/sh
# Single-process API + BullMQ worker for memory-constrained free tiers.
set -e
exec npx tsx server/src/stack/index.ts
