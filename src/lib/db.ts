// Backward-compatibility shim — re-exports the canonical client.
//
// The canonical Prisma singleton lives at `src/lib/prisma.ts` (see the
// comment there for the hot-reload rationale). This file is kept so any
// existing `@/lib/db` imports in the scaffold continue to resolve to the
// SAME client instance — there is exactly one PrismaClient per process.
//
// Prefer importing from `@/lib/prisma` directly in new code.
export { db } from "@/lib/prisma";
