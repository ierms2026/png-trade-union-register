import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClickableRow } from "@/components/app/clickable-row";

// =============================================================================
// Phase 1 tests: ClickableRow component.
//
// Uses renderToStaticMarkup (same pattern as t52-compliance-status-badge.test.ts)
// since @testing-library/react is not installed.
// =============================================================================

describe("ClickableRow", () => {
  it("renders a <button> by default", () => {
    const html = renderToStaticMarkup(
      createElement(ClickableRow, { onClick: () => {}, children: "Row content" }),
    );
    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain("Row content");
  });

  it("renders an <a> when href is provided", () => {
    const html = renderToStaticMarkup(
      createElement(ClickableRow, { href: "/unions/123", children: "Link content" }),
    );
    expect(html).toContain("<a");
    expect(html).toContain('href="/unions/123"');
    expect(html).toContain("Link content");
  });

  it("includes focus-visible ring class", () => {
    const html = renderToStaticMarkup(
      createElement(ClickableRow, { onClick: () => {}, children: "Content" }),
    );
    expect(html).toContain("focus-visible:ring");
  });

  it("renders disabled state on button", () => {
    const html = renderToStaticMarkup(
      createElement(ClickableRow, { onClick: () => {}, disabled: true, children: "Content" }),
    );
    expect(html).toContain("disabled");
  });

  it("renders aria-label when provided", () => {
    const html = renderToStaticMarkup(
      createElement(ClickableRow, {
        onClick: () => {},
        "aria-label": "View Test Union",
        children: "Content",
      }),
    );
    expect(html).toContain('aria-label="View Test Union"');
  });

  it("passes through custom className", () => {
    const html = renderToStaticMarkup(
      createElement(ClickableRow, {
        onClick: () => {},
        className: "grid grid-cols-2 gap-4",
        children: "Content",
      }),
    );
    expect(html).toContain("grid grid-cols-2 gap-4");
  });

  it("does not render href on <a> when disabled", () => {
    const html = renderToStaticMarkup(
      createElement(ClickableRow, {
        href: "/unions/123",
        disabled: true,
        children: "Content",
      }),
    );
    expect(html).toContain("<a");
    expect(html).not.toContain('href="/unions/123"');
    expect(html).toContain('aria-disabled="true"');
  });
});
