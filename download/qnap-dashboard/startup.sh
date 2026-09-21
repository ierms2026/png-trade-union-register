#!/usr/bin/env bash
# =============================================================================
# startup.sh — runs inside the Docker container on first boot + every restart.
#
# Steps:
#   1. prisma db push — creates/migrates the SQLite schema (idempotent)
#   2. seed-demo — inserts demo unions, rules, documents, users (idempotent
#      via upsert-style logic in the seed script)
#   3. reset-demo-passwords — sets Test!2345 for all demo accounts (idempotent)
#   4. node server.js — starts the production Next.js server
#
# The seed + reset run on every boot, but they're idempotent — they won't
# duplicate data or overwrite custom passwords (the reset script sets
# Test!2345 only for the 3 demo accounts; any accounts you create via the
# dashboard are untouched).
# =============================================================================

set -e

echo "[startup] Pushing database schema..."
npx prisma db push --skip-generate --accept-data-loss 2>&1 | tail -3

echo "[startup] Seeding demo data..."
npx tsx prisma/seed-demo.ts 2>&1 | tail -5

echo "[startup] Resetting demo passwords to Test!2345..."
npx tsx scripts/reset-demo-passwords.ts 2>&1 | tail -3

echo "[startup] Starting production server..."
echo "[startup] Dashboard will be at http://localhost:3000/ (or http://<qnap-ip>:3000/)"
exec node server.js
