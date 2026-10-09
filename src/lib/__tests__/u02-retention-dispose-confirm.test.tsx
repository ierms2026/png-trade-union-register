// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

afterEach(() => cleanup());

// Mock useFetch so the retention view renders a single pending item without
// hitting the network. The same pattern as u02-api-keys-confirm.test.tsx and
// u02-contact-requests-confirm.test.tsx.
vi.mock("@/components/app/use-fetch", () => ({
  useFetch: () => ({
    data: {
      pending: [
        {
          documentId: "doc-1",
          documentType: "Constitution",
          unionId: "u1",
          unionName: "Alpha Union",
          registrationNo: "IO-01",
          filedAt: "2020-01-01T00:00:00Z",
          retentionYrs: 7,
          disposalDueDate: "2027-01-01T00:00:00Z",
          snoozedUntil: null,
          versionNumber: 1,
          fileName: "constitution.pdf",
        },
      ],
    },
    loading: false, error: null, refetch: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { RetentionView } from "@/components/app/views/retention";

const REGISTRAR = { role: "REGISTRAR" as const };

describe("Retention disposal dialog (ConfirmDialog + requireText)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("clicking Approve Disposal opens the dialog and makes no API call", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    render(<RetentionView user={REGISTRAR} />);
    await waitFor(() => expect(screen.getByText("Constitution")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: /Approve Disposal/i }));
    await waitFor(() => expect(screen.getByText("Confirm Document Disposal")).toBeTruthy());
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/retention/"), expect.anything());
  });

  it("Cancel makes no API call and closes the dialog", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    render(<RetentionView user={REGISTRAR} />);
    await waitFor(() => expect(screen.getByText("Constitution")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: /Approve Disposal/i }));
    await waitFor(() => expect(screen.getByText("Confirm Document Disposal")).toBeTruthy());

    const cancelBtns = screen.getAllByRole("button", { name: "Cancel" });
    await user.click(cancelBtns[cancelBtns.length - 1]);
    await waitFor(() => expect(screen.queryByText("Confirm Document Disposal")).toBeNull());
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/retention/"), expect.anything());
  });

  it("Confirm is disabled until the exact document type is typed (requireText)", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    render(<RetentionView user={REGISTRAR} />);
    await waitFor(() => expect(screen.getByText("Constitution")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: /Approve Disposal/i }));
    await waitFor(() => expect(screen.getByText("Confirm Document Disposal")).toBeTruthy());

    const confirmBtn = screen.getByRole("button", { name: /Confirm Disposal/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);

    // The dialog is destructive, so Cancel gets autoFocus. Click the input
    // explicitly so keyboard typing lands in the right element.
    const input = screen.getByPlaceholderText("Constitution");
    await user.click(input);

    // Partial match — still disabled
    await user.keyboard("Const");
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);

    // Wrong case — still disabled
    await user.keyboard("X");
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);

    // Clear and type the exact text — enabled
    await user.clear(input);
    await user.keyboard("Constitution");
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);
  });

  it("Confirm calls POST /api/retention/{id}/approve exactly once", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    render(<RetentionView user={REGISTRAR} />);
    await waitFor(() => expect(screen.getByText("Constitution")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: /Approve Disposal/i }));
    await waitFor(() => expect(screen.getByText("Confirm Document Disposal")).toBeTruthy());

    // The dialog is destructive, so Cancel gets autoFocus. Click the input
    // explicitly so keyboard typing lands in the right element.
    const input = screen.getByPlaceholderText("Constitution");
    await user.click(input);
    await user.keyboard("Constitution");

    const confirmBtn = screen.getByRole("button", { name: /Confirm Disposal/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    await user.click(confirmBtn);
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/retention/doc-1/approve"), expect.anything());
    });
    const approveCalls = (fetchSpy.mock.calls as any[]).filter(
      ([url, opts]: [any, any]) =>
        url.includes("/api/retention/doc-1/approve") && opts?.method === "POST"
    );
    expect(approveCalls).toHaveLength(1);
  });

  it("failed API call keeps the dialog open with an inline error", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ error: "Document already disposed" }), { status: 409 })
    );
    render(<RetentionView user={REGISTRAR} />);
    await waitFor(() => expect(screen.getByText("Constitution")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: /Approve Disposal/i }));
    await waitFor(() => expect(screen.getByText("Confirm Document Disposal")).toBeTruthy());

    // The dialog is destructive, so Cancel gets autoFocus. Click the input
    // explicitly so keyboard typing lands in the right element.
    const input = screen.getByPlaceholderText("Constitution");
    await user.click(input);
    await user.keyboard("Constitution");
    await user.click(screen.getByRole("button", { name: /Confirm Disposal/i }));

    await waitFor(() => expect(screen.getByText("Document already disposed")).toBeTruthy());
    // Dialog stays open (title still visible)
    expect(screen.getByText("Confirm Document Disposal")).toBeTruthy();
  });
});

describe("Retention disposal dialog: focus return", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("heading has tabIndex=-1 so it can receive focus via returnFocusRef", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    render(<RetentionView user={REGISTRAR} />);
    await waitFor(() => expect(screen.getByText("Constitution")).toBeTruthy());

    const heading = screen.getByText("Retention Queue");
    expect(heading.getAttribute("tabindex")).toBe("-1");
  });

  it("after a successful disposal, focus returns to the heading (not body)", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    render(<RetentionView user={REGISTRAR} />);
    await waitFor(() => expect(screen.getByText("Constitution")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: /Approve Disposal/i }));
    await waitFor(() => expect(screen.getByText("Confirm Document Disposal")).toBeTruthy());

    // The dialog is destructive, so Cancel gets autoFocus. Click the input
    // explicitly so keyboard typing lands in the right element.
    const input = screen.getByPlaceholderText("Constitution");
    await user.click(input);
    await user.keyboard("Constitution");
    await user.click(screen.getByRole("button", { name: /Confirm Disposal/i }));

    await waitFor(() => {
      const heading = screen.getByText("Retention Queue");
      expect(document.activeElement).toBe(heading);
    }, { timeout: 3000 });
  });
});
