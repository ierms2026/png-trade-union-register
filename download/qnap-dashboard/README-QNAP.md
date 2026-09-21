# Register of Trade Unions Dashboard — QNAP TS-x31K Deployment

**Optimized for your setup**: Container Station (Docker) · 1GB RAM · LAN only · auto-start · QNAP snapshots

## What's in this package

```
qnap-dashboard/
├── app/                    # Pre-built Next.js standalone output (no build needed on QNAP!)
│   ├── server.js          # The production server (Node.js, ~68ms startup)
│   ├── .next/             # Compiled chunks + static assets
│   ├── public/            # Favicons, coat of arms, legislation JSON
│   ├── prisma/            # Schema + seed scripts
│   ├── scripts/           # Demo password reset script
│   ├── node_modules/      # Only the runtime dependencies (no dev deps)
│   └── .env               # SESSION_SECRET + DATABASE_URL
├── Dockerfile             # Builds the Docker image (no npm build — just prisma generate)
├── docker-compose.yml     # Container config with auto-start + volume + resource limits
├── startup.sh             # Runs on every boot: schema push → seed → reset passwords → serve
└── README-QNAP.md         # This file
```

## Why this approach works on 1GB RAM

The TS-x31K has 1GB RAM — too tight for `npm run build` (which spikes to 1.5-2GB). This package **skips the build step entirely** by shipping the pre-built standalone output. The Docker image only runs:
- `prisma generate` (fetches the ARM query engine, ~15MB, well within budget)
- `prisma db push` (creates the SQLite schema)
- `node server.js` (the production server, uses ~100-150MB RAM at runtime)

## Deployment steps

### 1. Copy the package to your QNAP

Copy the entire `qnap-dashboard/` folder to your QNAP. Via File Station:
- Upload to a shared folder, e.g. `/share/MD0_DATA/Container/dashboard/`

Or via SCP from your computer:
```bash
scp -r qnap-dashboard/ admin@<qnap-ip>:/share/MD0_DATA/Container/
```

### 2. Change the SESSION_SECRET (important for security)

Before building, edit `docker-compose.yml` and change the `SESSION_SECRET` to a random string. Generate one with:
```bash
openssl rand -hex 32
```
Replace `change-this-to-a-random-32-hex-string-in-production` with the generated value.

### 3. Build + start the container

SSH into your QNAP:
```bash
ssh admin@<qnap-ip>
cd /share/MD0_DATA/Container/dashboard/qnap-dashboard
docker-compose up -d --build
```

This takes ~2-3 minutes (downloads the Node.js base image + runs `prisma generate` for ARM).

### 4. Verify it's running

```bash
docker ps | grep dashboard
# Should show: trade-unions-dashboard ... Up ...
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/
# Should show: HTTP 200
```

### 5. Open the dashboard

On any device on your LAN, open:
```
http://<qnap-ip>:3000/
```

You'll see the public portal. Click "Staff Login" and use:
- **Email**: `registrar@example.com`
- **Password**: `Test!2345`

## Auto-start on boot

The `docker-compose.yml` already has `restart: unless-stopped`, which means:
- The container auto-starts when the QNAP boots
- It restarts if it crashes
- It does NOT restart if you explicitly stop it (`docker-compose down`)

In Container Station UI, you can also enable "Auto start" for the container.

## Backups via QNAP snapshots

The SQLite database lives in the Docker volume `dashboard-db`. To back it up:

### Option A — QNAP snapshot (recommended)
1. In QNAP Storage & Snapshots → Snapshot Manager
2. Take a snapshot of the volume where Docker stores volumes
3. Schedule daily snapshots via Snapshot Manager → Snapshot Schedule

### Option B — Manual SQLite dump
```bash
# On the QNAP, dump the database to a backup file
docker exec trade-unions-dashboard npx prisma db pull  # sync the schema
docker exec trade-unions-dashboard sqlite3 /app/db/custom.db .dump > backup-$(date +%Y%m%d).sql
```

## Managing the deployment

### View logs
```bash
docker-compose logs -f          # follow logs
docker-compose logs --tail 50   # last 50 lines
```

### Stop / restart
```bash
docker-compose stop              # stop (data persists)
docker-compose start             # start again
docker-compose restart           # restart
docker-compose down              # stop + remove container (data persists in volume)
docker-compose up -d             # start fresh
```

### Update the dashboard
When you have a new `qnap-dashboard/` package:
```bash
cd /share/MD0_DATA/Container/dashboard/qnap-dashboard
docker-compose down
# Replace the app/ folder with the new version
docker-compose up -d --build
```

### Reset the database (start fresh)
```bash
docker-compose down -v          # -v removes the volume (deletes the database!)
docker-compose up -d --build
```

## Demo accounts

| Role | Email | Password | Access |
|------|-------|----------|--------|
| Registrar (full) | `registrar@example.com` | `Test!2345` | All 13 destinations |
| Inspector (oversight) | `inspector@example.com` | `Test!2345` | 4 nav groups (no Tasks; narrower children) |
| Officer (single union) | `officer@example.com` | `Test!2345` | 5 groups with narrower children |

## Resource usage on the TS-x31K

| Resource | Expected usage |
|----------|----------------|
| RAM | ~100-150MB at runtime (well within 1GB) |
| CPU | Low — serves pre-compiled files |
| Disk | ~120MB (image) + database size (starts at ~5MB, grows with use) |
| Network | LAN only — no external traffic |

## Troubleshooting

- **Container won't start**: check logs with `docker-compose logs`
- **"PrismaClientInitializationError"**: the ARM query engine wasn't fetched during build. Run `docker-compose build --no-cache` to rebuild from scratch.
- **Port 3000 in use**: change the port in `docker-compose.yml` (e.g. `"3001:3000"`)
- **Slow first boot**: the `startup.sh` runs `prisma db push` + seed + password reset on every boot. This takes ~30s the first time; subsequent boots are faster (the DB already exists).
- **Out of memory**: the `mem_limit: 512m` in docker-compose.yml should be enough. If the container is OOM-killed, increase to `1g`.

## What's NOT included (and why)

- **`storage/` directory** (uploaded document files): the dashboard's compliance state comes from the database, not the file system. Document upload/download won't work without this, but the dashboard itself renders fine. If you need document downloads, copy the `storage/` folder from the dev environment separately + mount it as a volume.
- **Build tools** (TypeScript, ESLint, vitest): not needed in production — the app is pre-compiled.
- **The `.git` directory**: not needed for deployment.
- **Skills, docs, screenshots**: dev-environment only.
