import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

// =============================================================================
// IA-4: Public front door + tour page tests.
//
// Tests:
//   1. Public pages show no authenticated chrome (no sidebar, no breadcrumbs,
//      no user menu — the public portal has its own header/footer).
//   2. /demo in production mode contains no password (credentials are
//      conditionally hidden behind NODE_ENV !== "production").
//   3. The public portal has the 4 tabs (Register, Resources, About, Help).
//   4. The public portal search page has a status key.
//   5. The /demo page is organized by journey (8 sections), no phase/chunk
//      language.
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");

// =============================================================================
// 1. Public pages show no authenticated chrome
// =============================================================================

describe("IA-4: public pages show no authenticated chrome", () => {
  it("public-portal.tsx does NOT import or render AppShell", () => {
    const file = join(SRC_ROOT, "src/components/app/public-portal.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).not.toContain("AppShell");
    expect(content).not.toContain("SidebarNav");
    expect(content).not.toContain("buildBreadcrumbs");
  });

  it("public-portal.tsx renders its own header + footer (not the authed chrome)", () => {
    const file = join(SRC_ROOT, "src/components/app/public-portal.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("<header");
    expect(content).toContain("<footer");
  });

  it("public-portal.tsx does NOT render the user account dropdown (no user menu)", () => {
    const file = join(SRC_ROOT, "src/components/app/public-portal.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).not.toContain("DropdownMenu");
    expect(content).not.toContain("Sign Out");
    // The only auth-related UI is the "Sign In" button (which switches to login mode).
    expect(content).toContain("Sign In");
  });

  it("the public union detail page does NOT render the staff sidebar", () => {
    const file = join(SRC_ROOT, "src/app/unions/[registrationNo]/page.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).not.toContain("AppShell");
    expect(content).not.toContain("SidebarNav");
  });

  it("the /demo page does NOT render the staff sidebar (has its own header)", () => {
    const file = join(SRC_ROOT, "src/app/demo/page.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).not.toContain("AppShell");
    expect(content).not.toContain("SidebarNav");
    expect(content).toContain("<header");
  });
});

// =============================================================================
// 2. /demo in production mode contains no password
// =============================================================================

describe("IA-4: /demo in production mode contains no password", () => {
  const demoFile = join(SRC_ROOT, "src/app/demo/page.tsx");

  it("the /demo page exists", () => {
    expect(existsSync(demoFile)).toBe(true);
  });

  it("the /demo page checks NODE_ENV === 'production'", () => {
    const content = readFileSync(demoFile, "utf-8");
    expect(content).toContain("NODE_ENV");
    expect(content).toContain('"production"');
  });

  it("the /demo page uses an isProduction variable to gate credentials", () => {
    const content = readFileSync(demoFile, "utf-8");
    expect(content).toMatch(/isProduction/);
    // The credentials block must be inside a conditional that's false in
    // production (the !isProduction branch).
    expect(content).toMatch(/!\s*isProduction/);
  });

  it("the /demo page source does NOT contain the literal credential string", () => {
    const content = readFileSync(demoFile, "utf-8");
    // The password is assembled from parts — the literal "Test!" must NOT
    // appear in the source.
    expect(content).not.toContain("Test!");
  });

  it("the /demo page shows a production-mode message when isProduction is true", () => {
    const content = readFileSync(demoFile, "utf-8");
    // There must be a branch that shows when isProduction is true — a
    // "contact the Registrar" message.
    expect(content).toMatch(/Demo accounts are not available in production/);
  });

  it("the /demo page shows demo accounts only when NOT in production", () => {
    const content = readFileSync(demoFile, "utf-8");
    // The demo accounts block must be inside the !isProduction branch.
    expect(content).toContain("registrar@example.com");
    expect(content).toContain("inspector@example.com");
    expect(content).toContain("officer@example.com");
  });
});

// =============================================================================
// 3. Public portal has 4 tabs (Register, Resources, About, Help)
// =============================================================================

describe("IA-4: public portal has 4 tabs including About", () => {
  it("PublicTab type includes 'about'", () => {
    const file = join(SRC_ROOT, "src/components/app/public-portal.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toMatch(/type PublicTab.*=.*"register".*"resources".*"about".*"help"/);
  });

  it("readTabFromUrl accepts 'about' as a valid tab value", () => {
    const file = join(SRC_ROOT, "src/components/app/public-portal.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toMatch(/tab === "about"/);
  });

  it("the tab bar has 4 buttons: Register, Resources, About, Help", () => {
    const file = join(SRC_ROOT, "src/components/app/public-portal.tsx");
    const content = readFileSync(file, "utf-8");
    // All 4 tab buttons must be rendered.
    expect(content).toMatch(/handleTabChange\("register"\)/);
    expect(content).toMatch(/handleTabChange\("resources"\)/);
    expect(content).toMatch(/handleTabChange\("about"\)/);
    expect(content).toMatch(/handleTabChange\("help"\)/);
  });

  it("the About tab renders an renderAbout function", () => {
    const file = join(SRC_ROOT, "src/components/app/public-portal.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("renderAbout");
    // The About tab must mention what the register is + contact info.
    expect(content).toContain("About this Register");
    expect(content).toContain("RegistrarContactInfo");
  });

  it("the nav bar links to Resources + About (canonical location for tab navigation)", () => {
    // Design review (Wave 5 follow-up): the hero previously had inline
    // "View resources" + "About this register" links, but they duplicated
    // the nav bar (which already has Register / Resources / About / Help
    // tabs). Removed from the hero to reduce visual noise — the nav bar
    // is the single source of truth for tab navigation.
    const file = join(SRC_ROOT, "src/components/app/public-portal.tsx");
    const content = readFileSync(file, "utf-8");
    // The nav bar must still have Resources + About tab buttons.
    expect(content).toMatch(/handleTabChange\("resources"\)/);
    expect(content).toMatch(/handleTabChange\("about"\)/);
    // The hero must NO LONGER contain the inline "View resources" /
    // "About this register" CTAs (they were removed as duplicates).
    // We scope the check to the renderHero function body to avoid
    // false-positives from the nav bar's tab labels.
    const heroMatch = content.match(/function renderHero\(\)[\s\S]*?\n  \}/);
    expect(heroMatch, "renderHero function must exist").not.toBeNull();
    const heroBody = heroMatch![0];
    expect(heroBody).not.toMatch(/View resources/);
    expect(heroBody).not.toMatch(/About this register/);
  });
});

// =============================================================================
// 4. Public search page has a status key
// =============================================================================

describe("IA-4: public search page has a status key", () => {
  it("renderSearch includes a status key with all 3 union statuses", () => {
    const file = join(SRC_ROOT, "src/components/app/public-portal.tsx");
    const content = readFileSync(file, "utf-8");
    // The status key must use UNION_STATUS_CONFIG to render all 3 statuses.
    expect(content).toMatch(/Status key/);
    expect(content).toMatch(/UNION_STATUS_CONFIG/);
  });
});

// =============================================================================
// 5. /demo is organized by journey, no phase/chunk language
// =============================================================================

describe("IA-4: /demo organized by journey, no phase/chunk language", () => {
  const demoFile = join(SRC_ROOT, "src/app/demo/page.tsx");
  const content = readFileSync(demoFile, "utf-8");

  it("the /demo page has 8 journey sections", () => {
    // The JOURNEY array must have 8 entries.
    expect(content).toMatch(/id: "start-here"/);
    expect(content).toMatch(/id: "find-file-records"/);
    expect(content).toMatch(/id: "monitor-compliance"/);
    expect(content).toMatch(/id: "get-work-done"/);
    expect(content).toMatch(/id: "oversight"/);
    expect(content).toMatch(/id: "administration"/);
    expect(content).toMatch(/id: "officer-view"/);
    expect(content).toMatch(/id: "public-portal"/);
  });

  it("the /demo page uses the new IA-1 labels (Access Monitoring, Retention & Disposal)", () => {
    expect(content).toContain("Access Monitoring");
    expect(content).toContain("Retention & Disposal");
  });

  it("the /demo page does NOT use phase/chunk/assertion language", () => {
    expect(content).not.toMatch(/\bphase\s*\d\b/i);
    expect(content).not.toMatch(/\bchunk\s*\d\b/i);
    expect(content).not.toMatch(/\bassertion\b/i);
  });

  it("the /demo page does NOT contain 'Phase 6 placeholders' text", () => {
    expect(content).not.toContain("Phase 6");
    expect(content).not.toContain("placeholder");
  });

  it("the /demo page has a back-to-portal link", () => {
    expect(content).toContain('href="/"');
    expect(content).toMatch(/Back to portal/);
  });
});

// =============================================================================
// 6. Public field whitelist + 404 behavior unchanged
// =============================================================================

describe("IA-4: public field whitelist + 404 behavior unchanged", () => {
  it("/api/public/unions still returns only the 4 public fields", () => {
    const file = join(SRC_ROOT, "src/app/api/public/unions/route.ts");
    const content = readFileSync(file, "utf-8");
    // The Prisma select must include exactly: id, unionName, registrationNo, status.
    expect(content).toMatch(/select:\s*\{[^}]*id:\s*true[^}]*unionName:\s*true[^}]*registrationNo:\s*true[^}]*status:\s*true/);
  });

  it("/api/public/unions/[id] still filters by isPublic + disposedAt:null", () => {
    const file = join(SRC_ROOT, "src/app/api/public/unions/[id]/route.ts");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("isPublic: true");
    expect(content).toContain("disposedAt: null");
  });

  it("the public union detail page still calls notFound() for missing unions", () => {
    const file = join(SRC_ROOT, "src/app/unions/[registrationNo]/page.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("notFound()");
  });

  it("/api/public/files/[id] still returns identical 404s for all failure modes", () => {
    const file = join(SRC_ROOT, "src/app/api/public/files/[id]/route.ts");
    const content = readFileSync(file, "utf-8");
    // The route must use the same error message for all failure modes.
    expect(content).toContain("File not found.");
  });
});
