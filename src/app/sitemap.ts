import type { MetadataRoute } from "next";
import { db } from "@/lib/prisma";

// =============================================================================
// sitemap.ts — public routes only.
//
// The sitemap is for search engines (Google, Bing) and other crawlers. We
// include only PUBLIC, user-facing HTML pages — no API endpoints, no
// authenticated routes, no internal staff views.
//
// PUBLIC ROUTES:
//   /                                — the public portal (registry search)
//   /unions/[registrationNo]         — public union detail page (one per
//                                       registered union)
//
// EXCLUDED (intentionally):
//   /reports/compliance              — requires auth (calls notFound() if
//                                       no session). Not public.
//   /api/*                           — JSON endpoints, not HTML pages.
//   /?view=X                         — these are the same route as `/`
//                                       with a query string; the SPA
//                                       handles them client-side. They
//                                       don't belong in the sitemap.
//
// DYNAMIC ENTRIES: one <url> per registered union, so search engines can
// index every union's public detail page. We query the DB at build/request
// time. For very large registers (thousands of unions) this could be
// cached or paginated — the current scale (tens of unions) doesn't need it.
// =============================================================================

const FALLBACK_BASE_URL = "http://localhost:3000";

function getBaseUrl(): string {
  // NEXT_PUBLIC_APP_URL is the canonical base (e.g. https://urm.labour.gov.pg).
  // Fall back to localhost for dev. The trailing slash is stripped.
  return (process.env.NEXT_PUBLIC_APP_URL || FALLBACK_BASE_URL).replace(/\/+$/, "");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getBaseUrl();
  const now = new Date();

  // --- Static public routes ------------------------------------------------
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
  ];

  // --- Dynamic: one entry per registered union -----------------------------
  // We only include ACTIVE and SUSPENDED unions — DEREGISTERED unions are
  // kept on the register for historical reference, but we don't actively
  // want search engines indexing them as "current" unions. (The pages
  // still exist + are reachable; they're just not in the sitemap.)
  let unions: Array<{ registrationNo: string; updatedAt: Date }> = [];
  try {
    unions = await db.union.findMany({
      where: { status: { in: ["ACTIVE", "SUSPENDED"] } },
      select: { registrationNo: true, updatedAt: true },
      orderBy: { unionName: "asc" },
    });
  } catch {
    // If the DB is unavailable (e.g. build-time without DB), return just
    // the static entries. The sitemap is best-effort — it shouldn't break
    // the build.
  }

  const unionEntries: MetadataRoute.Sitemap = unions.map((u) => ({
    url: `${base}/unions/${encodeURIComponent(u.registrationNo)}`,
    lastModified: u.updatedAt,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [...staticEntries, ...unionEntries];
}
