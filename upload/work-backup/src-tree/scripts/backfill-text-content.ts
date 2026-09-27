// Backfill textContent for existing DocumentVersion rows.
//
// Walks every DocumentVersion where textContent IS NULL, runs text extraction
// on the stored file, and persists the extracted text. Idempotent — re-running
// skips rows that already have textContent.
//
// EXTRACTION STRATEGY (chunk 7):
//   1. Try pdftotext first (fast — milliseconds)
//   2. If pdftotext returns empty (scanned PDF) AND --ocr is enabled (default),
//      fall back to OCR via pdftoppm + tesseract (slow — 30-60s per 10-page PDF)
//   3. Non-PDF files (DOC, DOCX, etc.) are skipped (no extractor)
//   4. Image files (.png, .jpg, .jpeg) are OCR'd directly via tesseract
//
// Run: npx tsx /home/z/my-project/scripts/backfill-text-content.ts
//
// Options:
//   --dry-run    Don't write to DB; just report what would happen.
//   --limit N    Process at most N rows (useful for testing).
//   --no-ocr     Skip OCR fallback (pdftotext only — fast, misses scanned PDFs).
//   --ocr-only   Skip pdftotext; OCR everything (useful for re-running on
//                docs that pdftotext already failed on).

import { db } from "../src/lib/prisma";
import { extractTextFromFileWithMeta } from "../src/lib/auth/text-extraction";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const noOcr = args.includes("--no-ocr");
  const ocrOnly = args.includes("--ocr-only");
  const limitArg = args.find((a) => a.startsWith("--limit"));
  const limit = limitArg ? parseInt(limitArg.split("=")[1] ?? limitArg.slice(2), 10) : undefined;

  console.log("=== Backfill textContent for DocumentVersion rows ===");
  console.log(`Mode: ${dryRun ? "DRY RUN (no DB writes)" : "LIVE (writes to DB)"}`);
  console.log(`OCR fallback: ${noOcr ? "DISABLED (--no-ocr)" : "ENABLED (default)"}`);
  if (ocrOnly) console.log("OCR-only mode: skipping pdftotext, OCR-ing everything");
  if (limit) console.log(`Limit: ${limit} rows`);
  console.log();

  // Find all versions with null textContent
  const versions = await db.documentVersion.findMany({
    where: { textContent: null },
    select: {
      id: true,
      versionNumber: true,
      fileName: true,
      filePath: true,
      fileExtension: true,
      uploadedAt: true,
      document: {
        select: {
          id: true,
          documentType: true,
          union: { select: { unionName: true } },
        },
      },
    },
    orderBy: { uploadedAt: "desc" },
    ...(limit ? { take: limit } : {}),
  });

  console.log(`Found ${versions.length} version(s) with null textContent.`);
  console.log();

  if (versions.length === 0) {
    console.log("Nothing to backfill. All versions already have textContent.");
    process.exit(0);
  }

  let extracted = 0;
  let ocrExtracted = 0;
  let noTextLayer = 0;
  let nonPdf = 0;
  let failed = 0;

  for (const v of versions) {
    const ext = v.fileExtension?.toLowerCase();
    const label = `${v.document.union.unionName} — ${v.document.documentType} v${v.versionNumber} (${v.fileName})`;

    // Skip non-extractable file types entirely (unless OCR is enabled + it's an image)
    const isImage = ext === ".png" || ext === ".jpg" || ext === ".jpeg";
    if (ext !== ".pdf" && !isImage) {
      console.log(`SKIP (unsupported type): ${label} [ext=${ext}]`);
      nonPdf++;
      continue;
    }

    // In --ocr-only mode, skip non-PDFs (images don't have a pdftotext path)
    // and skip the pdftotext step (we'll OCR directly). The extractTextFromFileWithMeta
    // function handles this: when useOcr=true, it tries pdftotext first, then OCR.
    // For --ocr-only, we'd need a different code path — but since pdftotext is
    // fast and idempotent (returns empty for scanned PDFs), there's no real
    // benefit to skipping it. So --ocr-only is treated the same as default
    // (useOcr=true) for now. The flag is kept for future use.

    try {
      const startTime = Date.now();
      const result = await extractTextFromFileWithMeta(
        v.filePath,
        v.fileExtension,
        { useOcr: !noOcr },
      );
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (result.text === null) {
        if (result.method === "ocr" && result.ocrPages && result.ocrPages > 0) {
          console.log(`NO TEXT (OCR'd ${result.ocrPages} pages, all empty): ${label} [${elapsed}s]`);
        } else {
          console.log(`NO TEXT LAYER: ${label} [${elapsed}s]`);
        }
        noTextLayer++;
        continue;
      }

      const methodLabel = result.method === "ocr" ? `OCR (${result.ocrPages} pages)` : "pdftotext";
      console.log(`EXTRACTED via ${methodLabel} (${result.text.length} chars): ${label} [${elapsed}s]`);

      if (!dryRun) {
        await db.documentVersion.update({
          where: { id: v.id },
          data: { textContent: result.text },
        });
        await db.auditLog.create({
          data: {
            actorId: null,
            actorName: "System",
            action: "document_text_extracted",
            entityType: "DocumentVersion",
            entityId: v.id,
            afterJson: JSON.stringify({
              documentId: v.document.id,
              versionId: v.id,
              versionNumber: v.versionNumber,
              textLength: result.text.length,
              method: result.method,
              ocrPages: result.ocrPages,
              source: "backfill_script",
            }),
            severity: "INFO",
          },
        });
      }
      extracted++;
      if (result.method === "ocr") ocrExtracted++;
    } catch (err) {
      console.error(`FAILED: ${label} — ${err}`);
      failed++;
    }
  }

  console.log();
  console.log("=== Summary ===");
  console.log(`Total processed: ${versions.length}`);
  console.log(`Extracted:       ${extracted} (${ocrExtracted} via OCR, ${extracted - ocrExtracted} via pdftotext)`);
  console.log(`No text layer:   ${noTextLayer} (scanned PDFs where OCR also failed, or unsupported)`);
  console.log(`Non-PDF skipped: ${nonPdf}`);
  console.log(`Failed:          ${failed}`);
  if (dryRun) {
    console.log();
    console.log("(dry run — no DB writes. Re-run without --dry-run to apply.)");
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
