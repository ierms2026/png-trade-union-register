import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DOCUMENT_TYPE_CATEGORIES,
  INTERNAL_DOCUMENT_TYPES,
  isInternalDocumentType,
  filterOutInternalTypes,
  filterToInternalTypes,
} from "@/lib/dashboard/vocabulary";

// =============================================================================
// are hidden from Union Officials. They can't upload these types, can't see
// them in their Documents tab, and don't see them in their compliance matrix.
// =============================================================================

const SRC_ROOT = resolve(__dirname, "../../..");

describe("IA-4: internal document types", () => {
  it("the Oversight category is marked internal: true", () => {
    const oversight = DOCUMENT_TYPE_CATEGORIES.find((c) => c.label === "Oversight")!;
    expect(oversight.internal).toBe(true);
  });

  it("the other 3 categories are NOT internal", () => {
    const registration = DOCUMENT_TYPE_CATEGORIES.find((c) => c.label === "Registration")!;
    const annual = DOCUMENT_TYPE_CATEGORIES.find((c) => c.label === "Annual Filings")!;
    const governance = DOCUMENT_TYPE_CATEGORIES.find((c) => c.label === "Governance")!;
    expect(registration.internal).toBeFalsy();
    expect(annual.internal).toBeFalsy();
    expect(governance.internal).toBeFalsy();
  });

    expect(INTERNAL_DOCUMENT_TYPES.has("Inspection Reports")).toBe(true);
    expect(INTERNAL_DOCUMENT_TYPES.has("General Matters")).toBe(true);
  });

  it("INTERNAL_DOCUMENT_TYPES does NOT contain the 10 union-filed types", () => {
    expect(INTERNAL_DOCUMENT_TYPES.has("Registration Certificate")).toBe(false);
    expect(INTERNAL_DOCUMENT_TYPES.has("Rules & Constitution")).toBe(false);
    expect(INTERNAL_DOCUMENT_TYPES.has("Financial Returns")).toBe(false);
    expect(INTERNAL_DOCUMENT_TYPES.has("Financial Membership")).toBe(false);
    expect(INTERNAL_DOCUMENT_TYPES.has("Affiliations")).toBe(false);
    expect(INTERNAL_DOCUMENT_TYPES.has("Welfare Funds")).toBe(false);
    expect(INTERNAL_DOCUMENT_TYPES.has("Election of Office Bearers")).toBe(false);
    expect(INTERNAL_DOCUMENT_TYPES.has("Secret Ballots")).toBe(false);
    expect(INTERNAL_DOCUMENT_TYPES.has("General Secretary's Appointments")).toBe(false);
    expect(INTERNAL_DOCUMENT_TYPES.has("Application for Registration")).toBe(false);
  });

  it("isInternalDocumentType returns true for internal types", () => {
    expect(isInternalDocumentType("Inspection Reports")).toBe(true);
    expect(isInternalDocumentType("General Matters")).toBe(true);
  });

  it("isInternalDocumentType returns false for union-filed types", () => {
    expect(isInternalDocumentType("Rules & Constitution")).toBe(false);
    expect(isInternalDocumentType("Financial Returns")).toBe(false);
  });

  it("filterOutInternalTypes removes the 2 internal types", () => {
    const all12 = [
      "Application for Registration", "Registration Certificate", "Rules & Constitution",
      "Financial Returns", "Financial Membership", "Affiliations", "Welfare Funds",
      "Election of Office Bearers", "Secret Ballots", "General Secretary's Appointments",
    ];
    const filtered = filterOutInternalTypes(all12);
    expect(filtered).toHaveLength(10);
    expect(filtered).not.toContain("Inspection Reports");
    expect(filtered).not.toContain("General Matters");
  });

  it("filterToInternalTypes returns only the 2 internal types", () => {
    const all12 = [
      "Application for Registration", "Registration Certificate", "Rules & Constitution",
      "Financial Returns", "Financial Membership", "Affiliations", "Welfare Funds",
      "Election of Office Bearers", "Secret Ballots", "General Secretary's Appointments",
      "Inspection Reports", "General Matters",
    ];
    const internal = filterToInternalTypes(all12);
    expect(internal).toHaveLength(2);
    expect(internal).toContain("Inspection Reports");
    expect(internal).toContain("General Matters");
  });

describe("IA-4: Union Official upload picker filters internal types", () => {
  it("unions.tsx imports filterOutInternalTypes + isInternalDocumentType", () => {
    const file = join(SRC_ROOT, "src/components/app/views/unions.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("filterOutInternalTypes");
    expect(content).toContain("isInternalDocumentType");
  });

  it("UploadDialog accepts userRole + filters internal types for OFFICER", () => {
    const file = join(SRC_ROOT, "src/components/app/views/unions.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toMatch(/userRole.*string/);
    expect(content).toMatch(/userRole === "OFFICER"[\s\S]*filterOutInternalTypes/);
  });

  it("UnionComplianceTab filters internal types for OFFICER", () => {
    const file = join(SRC_ROOT, "src/components/app/views/unions.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toMatch(/userRole === "OFFICER"[\s\S]*isInternalDocumentType/);
  });

  it("allRequiredTypes is filtered for officers", () => {
    const file = join(SRC_ROOT, "src/components/app/views/unions.tsx");
    const content = readFileSync(file, "utf-8");
    expect(content).toMatch(/isOfficer[\s\S]*filterOutInternalTypes/);
  });
});

describe("IA-4: server-side enforcement — upload route rejects internal types for officers", () => {
  it("the upload route checks isInternalDocumentType for OFFICER role", () => {
    const file = join(SRC_ROOT, "src/app/api/unions/[unionId]/documents/route.ts");
    const content = readFileSync(file, "utf-8");
    expect(content).toContain("isInternalDocumentType");
    expect(content).toMatch(/Role\.OFFICER[\s\S]*isInternalDocumentType/);
    // Must return 403 for internal types
    expect(content).toMatch(/403/);
  });
});
