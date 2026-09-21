#!/usr/bin/env bash
# =============================================================================
# deploy-qnap.sh — Register of Trade Unions dashboard deployment script.
#
# For QNAP TS-x31K (ARM 32-bit, QTS). Run this on the QNAP itself via SSH.
# It assumes Node.js 18+ is installed (via App Center or nvm).
#
# USAGE:
#   1. Copy dashboard-deploy.tar.gz + this script to your QNAP (e.g. /share/MD0_DATA/dashboard/)
#   2. ssh into the QNAP
#   3. cd /share/MD0_DATA/dashboard
#   4. bash deploy-qnap.sh
#
# After deployment, the server runs on port 3000. Open http://<qnap-ip>:3000/
# =============================================================================

set -euo pipefail

APP_DIR="trade-unions-dashboard"
TARBALL="dashboard-deploy.tar.gz"

# --- 1. Extract ---------------------------------------------------------------
echo "[1/6] Extracting $TARBALL..."
mkdir -p "$APP_DIR"
tar -xzf "$TARBALL" -C "$APP_DIR"
cd "$APP_DIR"

# --- 2. Install dependencies --------------------------------------------------
echo "[2/6] Installing dependencies (this takes a few minutes on ARM)..."
npm install --production=false

# --- 3. Generate Prisma client (for ARM) --------------------------------------
echo "[3/6] Generating Prisma client for ARM..."
# Prisma generates the query engine for the host arch automatically.
npx prisma generate

# --- 4. Push the schema + seed the DB -----------------------------------------
echo "[4/6] Setting up the database..."
npx prisma db push --skip-generate

# Seed the demo data (unions, rules, documents, users)
echo "[4/6] Seeding demo data (this takes ~30s)..."
npx tsx prisma/seed-demo.ts

# Reset demo passwords (sets Test!2345 for all demo accounts)
echo "[4/6] Resetting demo passwords to Test!2345..."
npx tsx scripts/reset-demo-passwords.ts

# --- 5. Build the production server -------------------------------------------
echo "[5/6] Building production server (this takes ~2-5min on ARM)..."
npm run build

# --- 6. Start the server ------------------------------------------------------
echo "[6/6] Starting the production server..."
echo ""
echo "============================================"
echo "Dashboard is ready at http://$(hostname -I | awk '{print $1}'):3000/"
echo "Log in with: registrar@example.com / Test!2345"
echo "============================================"
echo ""
echo "The server is running in the foreground. Press Ctrl+C to stop."
echo "To run in the background: nohup node .next/standalone/server.js > server.log 2>&1 &"
echo ""

# Start the server in the foreground (Ctrl+C to stop)
cd .next/standalone
node server.js
