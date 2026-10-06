import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Field, focusFirstInvalid, type FieldAriaProps } from "@/components/app/field";

// =============================================================================
// Phase 1 tests: Field wrapper (U-14, U-15).
// =============================================================================

describe("Field", () => {
  it("renders children and does NOT set aria-invalid when no error", () => {
    const html = renderToStaticMarkup(
      createElement(Field, { error: null },
        ({ ariaProps }: { ariaProps: FieldAriaProps }) =>
          createElement("input", { ...ariaProps, type: "text" }),
      ),
    );
    expect(html).toContain("<input");
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("aria-describedby");
  });

  it("sets aria-invalid and aria-describedby when error is present", () => {
    const html = renderToStaticMarkup(
      createElement(Field, { error: "Title is required" },
        ({ ariaProps }: { ariaProps: FieldAriaProps }) =>
          createElement("input", { ...ariaProps, type: "text" }),
      ),
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("aria-describedby");
  });

  it("renders the error text with role=alert", () => {
    const html = renderToStaticMarkup(
      createElement(Field, { error: "Email is required" },
        () => createElement("input", { type: "text" }),
      ),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Email is required");
  });

  it("error element id matches aria-describedby value", () => {
    const html = renderToStaticMarkup(
      createElement(Field, { error: "Error text" },
        ({ ariaProps }: { ariaProps: FieldAriaProps }) =>
          createElement("input", { ...ariaProps, type: "text" }),
      ),
    );
    // Extract aria-describedby value
    const match = html.match(/aria-describedby="([^"]+)"/);
    expect(match).not.toBeNull();
    const describedBy = match![1];
    // The error element should have that id
    expect(html).toContain(`id="${describedBy}"`);
  });

  it("renders hint text with its own id when hint is provided", () => {
    const html = renderToStaticMarkup(
      createElement(Field, { hint: "Use 99 for permanent filings" },
        () => createElement("input", { type: "text" }),
      ),
    );
    expect(html).toContain("Use 99 for permanent filings");
    expect(html).toContain("text-muted-foreground");
  });

  it("includes hint id in aria-describedby alongside error id when both present", () => {
    const html = renderToStaticMarkup(
      createElement(Field, { error: "Required", hint: "Helpful hint" },
        ({ ariaProps }: { ariaProps: FieldAriaProps }) =>
          createElement("input", { ...ariaProps, type: "text" }),
      ),
    );
    const match = html.match(/aria-describedby="([^"]+)"/);
    expect(match).not.toBeNull();
    const ids = match![1].split(" ");
    expect(ids.length).toBe(2);
    // Both ids should exist as element ids in the HTML
    expect(html).toContain(`id="${ids[0]}"`);
    expect(html).toContain(`id="${ids[1]}"`);
  });

  it("does not render error element when error is null", () => {
    const html = renderToStaticMarkup(
      createElement(Field, { error: null },
        () => createElement("input", { type: "text" }),
      ),
    );
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("text-destructive");
  });
});

describe("focusFirstInvalid", () => {
  it("is a callable function", () => {
    expect(typeof focusFirstInvalid).toBe("function");
  });

  it("does not throw when container is null", () => {
    expect(() => focusFirstInvalid({ current: null })).not.toThrow();
  });
});
