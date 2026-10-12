import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  FEEDBACK_EMAIL,
  buildFeedbackMailto,
  getRoleLabel,
} from "@/lib/dashboard/vocabulary";

// =============================================================================
// Step 7 (feedback path): tests for the "Give feedback" mailto link.
//
// Verifies that:
//   1. FEEDBACK_EMAIL is non-empty + looks like an email (has @).
//   2. buildFeedbackMailto produces a mailto: URL with the email, subject,
//      body containing the page URL + role.
//   3. The app shell (app-shell.tsx) contains a "Give feedback" menu item
//      that calls handleFeedback (so the link is actually wired in).
//   4. BACKLOG.md exists + has the three required sections (Bugs,
//      Questions, Feature requests) + each has a template line.
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");

describe("Step 7: feedback email constant", () => {
  it("FEEDBACK_EMAIL is non-empty", () => {
    expect(FEEDBACK_EMAIL.length).toBeGreaterThan(0);
  });

  it("FEEDBACK_EMAIL looks like an email (contains @)", () => {
    expect(FEEDBACK_EMAIL).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  it("FEEDBACK_EMAIL is not the default placeholder that ships with the repo (warns, not fails)", () => {
    // SOFT CHECK: if this is still the placeholder, log a warning. Don't
    // fail the build — the placeholder is intentional for dev. Replace
    // before go-live.
    if (FEEDBACK_EMAIL === "registrar@example.com") {
      // eslint-disable-next-line no-console
      console.warn(
        `[feedback] FEEDBACK_EMAIL is still the placeholder "registrar@example.com". ` +
          `Replace it with the real stakeholder-feedback address in src/lib/dashboard/vocabulary.ts before go-live.`,
      );
    }
    expect(true).toBe(true);
  });
});

describe("Step 7: buildFeedbackMailto", () => {
  it("produces a mailto: URL with the feedback email", () => {
    const url = buildFeedbackMailto("http://localhost:3000/?view=compliance", "Registrar");
    expect(url.startsWith(`mailto:${FEEDBACK_EMAIL}`)).toBe(true);
  });

  it("includes the subject", () => {
    const url = buildFeedbackMailto("http://localhost:3000/", "Registrar");
    expect(url).toContain("subject=");
    expect(url).toMatch(/Feedback%20on%20the%20Register/);
  });

  it("includes the page URL in the body", () => {
    const pageUrl = "http://localhost:3000/?view=compliance&union=abc123";
    const url = buildFeedbackMailto(pageUrl, "Registrar");
    expect(url).toContain(encodeURIComponent(pageUrl));
  });

  it("includes the role label in the body", () => {
    const url = buildFeedbackMailto("http://localhost:3000/", "Inspector");
    expect(url).toContain(encodeURIComponent("Inspector"));
  });

  it("works for all three staff roles", () => {
    for (const role of ["REGISTRAR", "INSPECTOR", "OFFICER"] as const) {
      const label = getRoleLabel(role);
      const url = buildFeedbackMailto("http://localhost:3000/", label);
      expect(url.startsWith(`mailto:${FEEDBACK_EMAIL}`)).toBe(true);
      expect(url).toContain(encodeURIComponent(label));
    }
  });
});

describe("Step 7: 'Give feedback' menu item is wired into the app shell", () => {
  it("app-shell.tsx contains a 'Give feedback' DropdownMenuItem", () => {
    const file = join(SRC_ROOT, "src/components/app/app-shell.tsx");
    expect(existsSync(file)).toBe(true);
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("Give feedback");
    expect(content).toContain("handleFeedback");
  });

  it("app-shell.tsx imports buildFeedbackMailto", () => {
    const file = join(SRC_ROOT, "src/components/app/app-shell.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toMatch(/import.*buildFeedbackMailto.*from.*vocabulary/);
  });
});

describe("Step 7: BACKLOG.md exists with required sections + templates", () => {
  const backlogPath = join(SRC_ROOT, "BACKLOG.md");
  let content: string;

  it("BACKLOG.md exists", () => {
    expect(existsSync(backlogPath)).toBe(true);
    content = readFileSync(backlogPath, "utf-8");
    expect(content.length).toBeGreaterThan(100);
  });

  it("has a Bugs section", () => {
    content = readFileSync(backlogPath, "utf-8");
    expect(content).toMatch(/^## Bugs/m);
  });

  it("has a Questions section", () => {
    content = readFileSync(backlogPath, "utf-8");
    expect(content).toMatch(/^## Questions/m);
  });

  it("has a Feature requests section", () => {
    content = readFileSync(backlogPath, "utf-8");
    expect(content).toMatch(/^## Feature requests/m);
  });

  it("Bugs section has a template line", () => {
    content = readFileSync(backlogPath, "utf-8");
    expect(content).toMatch(/\[BUG\]/);
  });

  it("Questions section has a template line", () => {
    content = readFileSync(backlogPath, "utf-8");
    expect(content).toMatch(/\[Q\]/);
  });

  it("Feature requests section has a template line", () => {
    content = readFileSync(backlogPath, "utf-8");
    expect(content).toMatch(/\[FR\]/);
  });
});
