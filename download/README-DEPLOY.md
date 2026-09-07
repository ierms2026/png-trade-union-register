# Register of Trade Unions Dashboard — Local Deployment

## Prerequisites
- Node.js 18.18+ (https://nodejs.org/)
- npm (comes with Node.js)

## Quick start

```bash
# 1. Extract
mkdir ~/trade-unions-dashboard && cd ~/trade-unions-dashboard
tar -xzf /path/to/dashboard-deploy.tar.gz

# 2. Install dependencies
npm install

# 3. Set up the database (SQLite — no separate DB server needed)
npx prisma db push
npx tsx prisma/seed-demo.ts
npx tsx scripts/reset-demo-passwords.ts

# 4. Start the dev server
npm run dev

# 5. Open http://localhost:3000/ in your browser
#    Click "Staff Login" → log in with registrar@example.com / Test!2345
```

## For production mode (faster, no per-request compile)

```bash
npm run build
npm run start
# Open http://localhost:3000/
```

## Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Registrar (full access) | registrar@example.com | Test!2345 |
| Inspector (oversight) | inspector@example.com | Test!2345 |
| Officer (single union) | officer@example.com | Test!2345 |

## Troubleshooting
- **"SESSION_SECRET is required"**: add `SESSION_SECRET=any-random-string` to `.env`
- **Port 3000 in use**: run `PORT=3001 npm run dev`
- **First page load slow (~60s)**: normal — Turbopack compiles on first request
- **Login fails**: run `npx tsx scripts/reset-demo-passwords.ts` to reset passwords
