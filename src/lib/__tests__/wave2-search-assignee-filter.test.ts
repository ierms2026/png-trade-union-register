import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// =============================================================================
// Wave 2 / Item 3: Search — assigned officer filter.
//
// Audit finding: Global Search already had date-range + sort controls (done
// in a prior session per the conversation summary), but no way to filter by
// assigned officer. A Registrar/Inspector reviewing a specific officer's
// filings had to manually look up which union was assigned to that officer,
// then use the union filter. This was tedious + error-prone.
//
// Fix:
//   1. New /api/officers endpoint: lists OFFICER-role users + their assigned
//      union name. REGISTRAR+INSPECTOR only (Officers get 403 — their search
//      is already self-scoped, the filter is meaningless for them).
//   2. /api/search now accepts ?assignee=USER_ID, resolves it server-side
//      to the officer's assignedUnionId, and applies it as a union filter.
//   3. SearchView renders an "Assigned officer" dropdown, hidden for
//      Officers (when /api/officers returns 403). State syncs to URL with
//      ?assignee= param.
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");
const OFFICERS_API = resolve(SRC_ROOT, "src/app/api/officers/route.ts");
const SEARCH_API = resolve(SRC_ROOT, "src/app/api/search/route.ts");
const SEARCH_VIEW = resolve(SRC_ROOT, "src/components/app/views/search.tsx");

describe("Wave 2 / Item 3: assigned officer filter — /api/officers endpoint", () => {
  it("endpoint file exists at src/app/api/officers/route.ts", () => {
    expect(existsSync(OFFICERS_API)).toBe(true);
  });

  const src = readFileSync(OFFICERS_API, "utf-8");

  it("rejects unauthenticated callers with 401", () => {
    expect(src).toMatch(/Authentication required/);
    expect(src).toMatch(/status:\s*401/);
  });

  it("rejects OFFICER role with 403 (their search is self-scoped)", () => {
    expect(src).toMatch(/user\.role\s*===\s*Role\.OFFICER/);
    expect(src).toMatch(/status:\s*403/);
  });

  it("only returns OFFICER-role, non-disabled users", () => {
    expect(src).toMatch(/role:\s*Role\.OFFICER/);
    expect(src).toMatch(/disabled:\s*false/);
  });

  it("returns id + email + assignedUnionId + unionName (joined)", () => {
    expect(src).toMatch(/id:\s*o\.id/);
    expect(src).toMatch(/email:\s*o\.email/);
    expect(src).toMatch(/assignedUnionId:\s*o\.assignedUnionId/);
    expect(src).toMatch(/unionName:/);
  });

  it("does NOT return sensitive fields (passwordHash, twoFactorSecret, etc.)", () => {
    // The select clause must explicitly list fields — Prisma returns all
    // fields if select is omitted. Verify the select clause is present +
    // doesn't include sensitive fields.
    expect(src).toMatch(/select:\s*\{/);
    // Sensitive fields must NOT appear in the select clause.
    expect(src).not.toMatch(/passwordHash/);
    expect(src).not.toMatch(/twoFactorSecret/);
    expect(src).not.toMatch(/passwordResetToken/);
  });

  it("uses a batched union lookup (no N+1 — single db.union.findMany with `in`)", () => {
    // The User model has assignedUnionId but no Prisma relation to Union
    // (the relation was never declared in the schema). The endpoint must
    // do a separate batched lookup — NOT one query per officer.
    expect(src).toMatch(/db\.union\.findMany/);
    expect(src).toMatch(/where:\s*\{\s*id:\s*\{\s*in:\s*unionIds\s*\}\s*\}/);
  });
});

describe("Wave 2 / Item 3: assigned officer filter — /api/search extension", () => {
  const src = readFileSync(SEARCH_API, "utf-8");

  it("API reads ?assignee param from the URL", () => {
    expect(src).toMatch(/url\.searchParams\.get\("assignee"\)/);
  });

  it("API docstring documents the ?assignee param + the OFFICER-caller bypass", () => {
    expect(src).toMatch(/\?assignee=USER_ID/);
    expect(src).toMatch(/Ignored for OFFICER callers/);
  });

  it("API resolves assignee → officer's assignedUnionId server-side (no client leak)", () => {
    // The resolution must happen server-side. The client only sends a
    // user ID; the server looks up the user's role + assignedUnionId +
    // applies the union filter. This prevents an OFFICER from being able
    // to probe other officers' union assignments via the search API.
    expect(src).toMatch(/db\.user\.findUnique/);
    expect(src).toMatch(/where:\s*\{\s*id:\s*assigneeFilter\s*\}/);
    expect(src).toMatch(/officer\.role\s*===\s*Role\.OFFICER/);
    expect(src).toMatch(/officer\.assignedUnionId/);
  });

  it("API rejects invalid assignee (non-officer, disabled, or no assigned union) with 0 results", () => {
    // Sentinel unionId that matches nothing — semantic: "an officer with
    // no assigned union has no documents to find." This avoids leaking
    // info about whether the user ID exists.
    expect(src).toMatch(/"__none__"/);
  });

  it("API skips the assignee lookup for OFFICER callers (their scope is already self-union)", () => {
    // scope.kind === "union" is the OFFICER case. The assignee filter
    // would be redundant (always themselves).
    expect(src).toMatch(/assigneeFilter\s*&&\s*scope\.kind\s*!==\s*"union"/);
  });
});

describe("Wave 2 / Item 3: assigned officer filter — SearchView UI", () => {
  const src = readFileSync(SEARCH_VIEW, "utf-8");

  it("view defines an Officer interface + fetches /api/officers", () => {
    expect(src).toMatch(/interface\s+Officer\s*\{/);
    expect(src).toMatch(/interface\s+OfficersResponse\s*\{/);
    expect(src).toMatch(/useFetch<OfficersResponse>\("\/api\/officers"\)/);
  });

  it("view has assigneeFilter state", () => {
    expect(src).toMatch(/assigneeFilter/);
    expect(src).toMatch(/setAssigneeFilter/);
  });

  it("view initializes assigneeFilter from URL ?assignee param (default 'all')", () => {
    expect(src).toMatch(/params\.get\("assignee"\)\s*\?\?\s*"all"/);
  });

  it("view only renders the assignee dropdown when /api/officers succeeds + has results", () => {
    // showAssigneeFilter guards the render — Officers (who get 403) don't
    // see the dropdown. Also hides when there are no officers in the system.
    expect(src).toMatch(/showAssigneeFilter\s*=\s*!officersError\s*&&\s*officers\.length\s*>\s*0/);
    expect(src).toMatch(/\{showAssigneeFilter\s*&&\s*\(/);
  });

  it("view sends ?assignee= param to the search API when set", () => {
    expect(src).toMatch(/if\s*\(assigneeFilter\s*!==\s*"all"\)\s*params\.set\("assignee",\s*assigneeFilter\)/);
  });

  it("view pushes ?assignee= to the URL on filter change", () => {
    expect(src).toMatch(/url\.searchParams\.set\("assignee",\s*assignee\)/);
  });

  it("view includes assignee in handleClearFilters (clears it too)", () => {
    expect(src).toMatch(/setAssigneeFilter\("all"\)/);
    expect(src).toMatch(/assignee:\s*"all"/);
  });

  it("view includes assignee in hasFilters check (shows 'Clear filters' button when set)", () => {
    expect(src).toMatch(/hasFilters\s*=\s*[\s\S]*assigneeFilter\s*!==\s*"all"/);
  });

  it("view handles Back/Forward by re-reading assignee from URL", () => {
    expect(src).toMatch(/setAssigneeFilter\(state\.assignee\)/);
  });

  it("dropdown shows officer email + union name (e.g. 'jane@example.com — Alpha Union')", () => {
    expect(src).toMatch(/o\.email/);
    expect(src).toMatch(/o\.unionName/);
  });

  it("dropdown includes an 'All officers' default option", () => {
    expect(src).toMatch(/All officers/);
  });
});
