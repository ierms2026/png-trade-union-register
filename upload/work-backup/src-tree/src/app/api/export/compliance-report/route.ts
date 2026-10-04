import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";
import { Role } from "@prisma/client";
import { buildComplianceReportHtml } from "@/lib/compliance/report-html";

const execFileAsync = promisify(execFile);

// =============================================================================
// GET /api/export/compliance-report?unionId=...
// -----------------------------------------------------------------------------
// Chunk 12: Generate a multi-section compliance report as a PDF.
//
// SECTIONS:
//   1. Cover page (title, date, scope, overall compliance rate)
//   2. Executive summary (KPI tiles)
//   3. Compliance matrix (full table with color-coded statuses)
//   4. Needs attention (overdue + expiring documents)
//   5. Expiry forecast (30/60/90-day buckets)
//   6. Status legend
//
// AUTH: API key (preferred) or session cookie. Requires `compliance:read`
// scope. Officer/Representative scoping applies (only their union's data).
//
// QUERY PARAMS:
//   unionId  — optional, filter to a single union (for per-union reports)
//
// RESPONSE: application/pdf with Content-Disposition: attachment
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUserOrApiKey(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasScope(user, "compliance:read")) {
    return NextResponse.json(
      { error: "Your API key does not have the 'compliance:read' scope." },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  let unionId = url.searchParams.get("unionId");

  // Officer/Representative scoping — force their union
  const isUnionScopedRole = user.role === Role.OFFICER || user.role === Role.REPRESENTATIVE;
  if (isUnionScopedRole && user.assignedUnionId) {
    unionId = user.assignedUnionId;
  }

  // --- Build the report HTML ------------------------------------------------
  let reportHtml: string;
  let stats: { totalUnions: number; overallRate: number };
  try {
    const result = await buildComplianceReportHtml({
      unionId: unionId || null,
      preparedBy: user.email,
    });
    reportHtml = result.html;
    stats = result.stats;
  } catch (err) {
    console.error("[compliance-report] HTML generation failed:", err);
    return NextResponse.json(
      { error: "Failed to generate report HTML." },
      { status: 500 },
    );
  }

  // --- Render HTML → PDF via WeasyPrint ------------------------------------
  // Write the HTML to a temp file, run the Python renderer, read the PDF.
  const tmpHtmlPath = path.join(os.tmpdir(), `urm-report-${Date.now()}.html`);
  const tmpPdfPath = path.join(os.tmpdir(), `urm-report-${Date.now()}.pdf`);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = unionId
    ? `compliance-report-${dateStr}.pdf`
    : `compliance-report-all-${dateStr}.pdf`;

  try {
    await fs.writeFile(tmpHtmlPath, reportHtml, "utf8");

    const scriptPath = path.join(process.cwd(), "scripts", "render-pdf.py");
    try {
      await execFileAsync(
        "python3",
        [scriptPath, "--output", tmpPdfPath, "--input", tmpHtmlPath],
        { maxBuffer: 50 * 1024 * 1024, timeout: 60_000 },
      );
    } catch (err) {
      console.error("[compliance-report] WeasyPrint failed:", err);
      return NextResponse.json(
        { error: "PDF rendering failed. WeasyPrint may not be installed." },
        { status: 500 },
      );
    }

    const pdfBuffer = await fs.readFile(tmpPdfPath);

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
        "Cache-Control": "private, no-cache",
      },
    });
  } finally {
    // Cleanup temp files
    await fs.unlink(tmpHtmlPath).catch(() => {});
    await fs.unlink(tmpPdfPath).catch(() => {});
  }
}
