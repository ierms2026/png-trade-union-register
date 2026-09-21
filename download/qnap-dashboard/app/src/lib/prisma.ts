import { PrismaClient } from "@prisma/client";

// =============================================================================
// Prisma Client singleton — canonical entry point for the whole app.
//
// WHY THIS EXISTS:
// Next.js dev mode hot-reloads modules on every save. If `new PrismaClient()`
// ran each time, the dev process would spawn a new connection pool on every
// reload and exhaust SQLite's connection limit within minutes (production
// doesn't hot-reload, but we don't want a dev/prod split here).
//
// The fix: stash the client on `globalThis` once, reuse it for every reload.
// `globalThis` is preserved across HMR events, so the same client survives.
//
// WHY NOT `log: ['query']`:
// The scaffold shipped with full query logging. That's useful for first-day
// debugging but is a liability in this app — Prisma query args can contain
// user emails, password hashes, 2FA secrets, audit-log JSON snapshots. Any
// of those leaking into `dev.log` is a PII exposure we don't want, even in
// dev. We log only `error` + `warn` (Prisma's own runtime errors, not query
// args). If you need query-level debugging, opt in temporarily:
//   new PrismaClient({ log: ['query', 'error', 'warn'] })
//
// USAGE:
//   import { db } from "@/lib/prisma";
//   const user = await db.user.findUnique({ where: { email } });
// =============================================================================

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

// In dev, cache the client on globalThis so HMR doesn't spawn a new one
// per reload. In production, globalForPrisma.prisma stays undefined and
// we use the freshly constructed client above (no leak across requests).
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
