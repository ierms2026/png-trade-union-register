# Register of Trade Unions Dashboard — QNAP TS-x31K Deployment

This package deploys the staff dashboard to a QNAP TS-x31K NAS.

## Files in this package

- `dashboard-deploy.tar.gz` — the app source code (9.1 MB, excludes node_modules + db + storage)
- `deploy-qnap.sh` — deployment script (native install on QNAP)
- `Dockerfile` — alternative Docker deployment (if you use Container Station)

## Prerequisites

- **QNAP TS-x31K** running QTS
- **Node.js 18+** (install via App Center → "Node.js" or via `nvm`)
- **2GB+ free RAM** (the TS-x31K has 1-2GB; close other apps during the build)
- **~500MB free disk** (node_modules + build output)

## Option A — Native install (recommended for TS-x31K)

```bash
# 1. Copy these 3 files to your QNAP (e.g. via File Station to /share/MD0_DATA/dashboard/)
#    - dashboard-deploy.tar.gz
#    - deploy-qnap.sh
#    - this README.md

# 2. SSH into your QNAP
ssh admin@<qnap-ip>

# 3. Navigate to where you copied the files
cd /share/MD0_DATA/dashboard/

# 4. Run the deployment script
bash deploy-qnap.sh
```

The script will:
1. Extract the tarball
2. Install npm dependencies (~3-5 min on ARM)
3. Generate the Prisma client for ARM
4. Set up the SQLite database + seed demo data
5. Build the production server (~2-5 min on ARM)
6. Start the server on port 3000

When it says "Dashboard is ready at http://<ip>:3000/", open that URL in your browser + log in with:
- **Email**: `registrar@example.com`
- **Password**: `Test!2345`

## Option B — Docker (if you use Container Station)

```bash
# 1. Copy dashboard-deploy.tar.gz + Dockerfile to a folder on QNAP
# 2. Extract the tarball
mkdir dashboard && cd dashboard
tar -xzf ../dashboard-deploy.tar.gz
cp ../Dockerfile .

# 3. Build the Docker image (Container Station does this via UI too)
docker build -t trade-unions-dashboard .

# 4. Run the container
docker run -d -p 3000:3000 -v dashboard-data:/app/db --name dashboard trade-unions-dashboard
```

## Keeping the server alive

### Native install (Option A)
The script runs the server in the foreground. To keep it alive after you close SSH:
```bash
nohup node .next/standalone/server.js > server.log 2>&1 &
```

To auto-start on QNAP boot, add the start command to QNAP's autorun.sh (System → Hardware → autorun).

### Docker (Option B)
The `docker run -d` flag already runs it detached. To auto-start on boot, in Container Station → your container → "Auto start" = ON.

## Demo accounts

| Role | Email | Password | Access |
|------|-------|----------|--------|
| Registrar (full) | `registrar@example.com` | `Test!2345` | All 13 destinations |
| Inspector (oversight) | `inspector@example.com` | `Test!2345` | 4 nav groups (no Tasks; narrower children) |
| Officer (single union) | `officer@example.com` | `Test!2345` | 5 groups with narrower children |

## Troubleshooting

- **"Cannot find module"** — run `npm install` again; ARM native modules can fail to install on first try.
- **Prisma errors** — run `npx prisma generate` to rebuild the ARM query engine.
- **"SESSION_SECRET is required"** — the .env file includes a default; change it for production via `echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env`.
- **Slow build** — the TS-x31K's ARM CPU is slow; expect 2-5 min for `npm run build`. Close other QNAP apps during the build.
- **Out of memory during build** — the TS-x31K has 1-2GB RAM. If the build fails with OOM, try `NODE_OPTIONS="--max-old-space-size=512" npm run build` to limit Node's heap.
- **Port 3000 in use** — change the port: `node .next/standalone/server.js -p 3001` (or `PORT=3001 node server.js`).

## What's NOT included

- The `storage/` directory (uploaded document files) — the dashboard works without it (compliance state comes from the DB, not the file system). If you want document downloads to work, copy the `storage/` folder from the dev environment separately.
- The `upload/work-backup/` directory (backup scripts) — not needed for deployment.
- The `skills/` directory (dev tooling) — not needed for deployment.
- The `docs/layout-screenshots/` — not needed for deployment.

## After deployment

Once you've deployed + can see the dashboard, log in as Registrar + explore:
1. **Quick Actions** (4 buttons)
2. **KPI band** (7 cards: Total Unions · Documents · Compliance Rate · Compliant · Expiring · Overdue · Missing — hover/focus any label for a definition tooltip)
3. **Needs Attention | Composition bar** (two-column)
4. **Compliance Heatmap** (full width)
5. **Required vs On-File | Expiry Forecast** (two-column)
6. **Compliance Trend | Recent Activity** (two-column)
7. **Nav** (5 top-level items with 3 dropdowns: Unions ▾, Compliance ▾, Admin ▾)
