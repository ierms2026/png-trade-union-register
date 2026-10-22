# Deploying to Vercel — Quick Guide

## Prerequisites
- GitHub account + the repo pushed there
- Vercel account (free at vercel.com)
- Neon PostgreSQL database (free at neon.tech)

## Steps

### 1. Create a PostgreSQL database
1. Go to [neon.tech](https://neon.tech) → Sign up with GitHub
2. Create a project → copy the connection string (starts with `postgresql://`)

### 2. Deploy to Vercel
1. Go to [vercel.com/new](https://vercel.com/new) → Sign in with GitHub
2. Import the `png-trade-union-register` repository
3. Add these Environment Variables:

| Name | Value |
|---|---|
| `DATABASE_URL` | *(your Neon connection string)* |
| `SESSION_SECRET` | *(run `openssl rand -hex 32` in terminal)* |
| `CRON_SECRET` | *(run `openssl rand -hex 32` again)* |
| `DEMO_PASSWORD` | `Test!2345abc` |

4. Click **Deploy** → wait 3 minutes

### 3. Set up the database
After deploy, run these locally (with `DATABASE_URL` pointed at Neon):
```
npx prisma db push
npx tsx prisma/seed-demo.ts
```

### 4. Open your live URL
- `https://png-trade-union-register.vercel.app/`
- Login: `registrar@example.com` / `Test!2345abc`

## Local dev (switch back to SQLite)
In `prisma/schema.prisma`: comment out `provider = "postgresql"`, uncomment `provider = "sqlite"`.
In `.env`: set `DATABASE_URL=file:./db/custom.db`.
Run `npx prisma db push && npx tsx prisma/seed-demo.ts && npm run dev`.
