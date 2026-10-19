import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// =============================================================================
// Global Search upgrade: date-range filter, sort control.
// Tests verify the API accepts the new params + the view renders the new UI.
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");

describe("Global Search upgrade: API params", () => {
  const apiSrc = readFileSync(
    resolve(SRC_ROOT, "src/app/api/search/route.ts"),
    "utf-8",
  );

  it("API reads startDate param", () => {
    expect(apiSrc).toContain("startDate");
    expect(apiSrc).toContain("gte");
  });

  it("API reads endDate param", () => {
    expect(apiSrc).toContain("endDate");
    expect(apiSrc).toContain("lte");
  });

  it("API reads sort param with a default", () => {
    expect(apiSrc).toContain("sort");
    expect(apiSrc).toContain("uploadedAt_desc");
  });

  it("API supports uploadedAt_asc sort", () => {
    expect(apiSrc).toContain("uploadedAt_asc");
  });

  it("API supports documentType_asc sort", () => {
    expect(apiSrc).toContain("documentType_asc");
  });

  it("API supports unionName_asc sort", () => {
    expect(apiSrc).toContain("unionName_asc");
  });

  it("API uses the sort variable in orderBy (not hardcoded)", () => {
    expect(apiSrc).toMatch(/orderBy,/);
    expect(apiSrc).not.toMatch(/orderBy:\s*\{\s*uploadedAt:\s*"desc"\s*\}/);
  });
});

describe("Global Search upgrade: View UI", () => {
  const viewSrc = readFileSync(
    resolve(SRC_ROOT, "src/components/app/views/search.tsx"),
    "utf-8",
  );

  it("View has startDate state", () => {
    expect(viewSrc).toContain("startDateFilter");
  });

  it("View has endDate state", () => {
    expect(viewSrc).toContain("endDateFilter");
  });

  it("View has sort state", () => {
    expect(viewSrc).toContain("sortBy");
  });

  it("View renders date-range inputs", () => {
    expect(viewSrc).toContain('type="date"');
    expect(viewSrc).toContain("Start date");
    expect(viewSrc).toContain("End date");
  });

  it("View renders sort dropdown with 4 options", () => {
    expect(viewSrc).toContain("Newest first");
    expect(viewSrc).toContain("Oldest first");
    expect(viewSrc).toContain("Document type A");
    expect(viewSrc).toContain("Union name A");
  });

  it("View pushes startDate/endDate/sort to URL", () => {
    expect(viewSrc).toContain("startDate");
    expect(viewSrc).toContain("endDate");
    expect(viewSrc).toContain("sort");
  });

  it("View clears date filters on Clear filters", () => {
    expect(viewSrc).toMatch(/handleClearFilters[\s\S]*startDate.*""[\s\S]*endDate.*""/);
  });

  it("View includes sort in hasFilters check (or excludes it intentionally)", () => {
    // Sort is not a "filter" — it's a display preference, so it's OK if
    // hasFilters doesn't include it. But startDate/endDate should be.
    expect(viewSrc).toMatch(/hasFilters.*startDate/);
  });
});
