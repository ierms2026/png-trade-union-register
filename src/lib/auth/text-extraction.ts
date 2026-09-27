import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { promises as fs, createReadStream } from "node:fs";
import { createHash } from "node:crypto";

const execAsync = promisify(exec);

// =============================================================================
// Text extraction utilities — extract searchable text from uploaded documents.
//
// Strategy (chunk 6 + chunk 7 OCR):
//   1. PDF files → try `pdftotext` first (fast, handles born-digital PDFs)
//   2. If pdftotext returns empty (scanned PDF) AND useOcr=true → fall back
//      to OCR via `pdftoppm` (PDF → PNG pages) + `tesseract` (PNG → text)
//   3. Image files (.png, .jpg, .jpeg) → OCR via `tesseract` (if useOcr=true)
//   4. Other files → no extraction (textContent stays null)
//
// WHY pdftotext FIRST (not OCR-first):
//   - pdftotext is ~100x faster than OCR (milliseconds vs 30-60 seconds)
//   - pdftotext preserves layout + exact text (OCR has ~95% accuracy)
//   - Born-digital PDFs (the common case) have a text layer — pdftotext
//     extracts it perfectly. OCR would re-recognize the text with errors.
//   - Scanned PDFs have NO text layer — pdftotext returns empty, then we
//     fall back to OCR.
//
// WHY useOcr IS OPT-IN (default false):
//   - OCR is slow (30-60s for a 10-page scanned PDF). Calling it in the
//     upload route's auto-extraction would block the upload response.
//   - The upload route uses useOcr=false (pdftotext only — fast).
//   - The manual extract-text route + backfill script use useOcr=true
//     (OCR fallback for scanned PDFs — the caller expects it to be slow).
//
// WHY SYSTEM TESSERACT (not tesseract.js npm package):
//   - Already installed on the server (tesseract 5.5.0 + English language data)
//   - Faster than the WASM port (native binary, no JIT overhead)
//   - No npm dependency, no WASM/language-data download on first use
//   - Same exec pattern as pdftotext (consistent with the existing code)
//
// OCR PAGE LIMIT:
//   OCR is capped at 10 pages per document (MAX_OCR_PAGES). This matches
//   the existing 50k char text cap (~10 pages of text). Larger documents
//   get the first 10 pages OCR'd — enough for search indexing of the
//   most important content (cover page, table of contents, first sections).
//
// TEMP FILE MANAGEMENT:
//   OCR requires temp PNG files (pdftoppm output). These are created in
//   the OS temp dir with a unique prefix, and cleaned up in a finally
//   block — even if OCR fails partway through, no temp files are leaked.
// =============================================================================

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");

/**
 * Maximum number of PDF pages to OCR. Pages beyond this are skipped.
 * Matches the existing 50k char text cap (~10 pages of text).
 */
const MAX_OCR_PAGES = 10;

/**
 * DPI for the PDF → PNG conversion. 300 DPI is the standard for OCR —
 * high enough for tesseract to recognize text accurately, low enough
 * to keep the PNG file size manageable (~1-2 MB per page).
 */
const OCR_DPI = 300;

/**
 * Maximum text length to store. Matches the existing pdftotext cap.
 * OCR text is typically longer (includes layout artifacts) so this cap
 * is more likely to trigger for OCR'd documents.
 */
const MAX_TEXT_LENGTH = 50_000;

export interface ExtractOptions {
  /**
   * If true, fall back to OCR (pdftoppm + tesseract) when pdftotext returns
   * empty (scanned PDFs). Also enables OCR for image files.
   *
   * Default: false. Set to true in the manual extract-text route + backfill
   * script where the caller expects OCR to be slow.
   */
  useOcr?: boolean;
}

export interface ExtractResult {
  /** The extracted text, or null if extraction failed / no text layer. */
  text: string | null;
  /** The method used: "pdftotext" (fast), "ocr" (slow fallback), or null. */
  method: "pdftotext" | "ocr" | null;
  /** For OCR, the number of pages processed. 0 for pdftotext. */
  ocrPages?: number;
}

/**
 * Extract text from a stored document file.
 *
 * @param filePath      Relative path (from STORAGE_ROOT) to the file.
 * @param fileExtension File extension including dot (e.g., ".pdf", ".png").
 * @param options       Optional: { useOcr } — enable OCR fallback for scanned PDFs.
 * @returns The extracted text, or null if extraction failed.
 */
export async function extractTextFromFile(
  filePath: string,
  fileExtension: string | null,
  options?: ExtractOptions,
): Promise<string | null> {
  const result = await extractTextFromFileWithMeta(filePath, fileExtension, options);
  return result.text;
}

/**
 * Same as extractTextFromFile, but returns metadata about the extraction
 * method (pdftotext vs OCR) + page count. Useful for audit logging.
 *
 * @returns { text, method, ocrPages } — method is null when no text was
 *          extracted; ocrPages is 0 for pdftotext, N for OCR.
 */
export async function extractTextFromFileWithMeta(
  filePath: string,
  fileExtension: string | null,
  options?: ExtractOptions,
): Promise<ExtractResult> {
  const absolutePath = path.join(STORAGE_ROOT, filePath);
  const ext = fileExtension?.toLowerCase();
  const useOcr = options?.useOcr ?? false;

  try {
    if (ext === ".pdf") {
      return await extractTextFromPdf(absolutePath, useOcr);
    }
    if (useOcr && (ext === ".png" || ext === ".jpg" || ext === ".jpeg")) {
      // Direct image OCR (no pdftoppm needed — the file is already an image)
      const text = await ocrImage(absolutePath);
      return { text, method: text ? "ocr" : null, ocrPages: text ? 1 : 0 };
    }
    // Other file types (DOC, DOCX, etc.) — no extractor. textContent stays null.
    return { text: null, method: null, ocrPages: 0 };
  } catch (err) {
    console.error(`[text-extraction] Failed to extract from ${filePath}:`, err);
    return { text: null, method: null, ocrPages: 0 };
  }
}

/**
 * Extract text from a PDF. Tries pdftotext first; if that returns empty
 * (scanned PDF) and useOcr is true, falls back to OCR.
 */
async function extractTextFromPdf(
  absolutePath: string,
  useOcr: boolean,
): Promise<ExtractResult> {
  // --- Step 1: Try pdftotext (fast) --------------------------------------
  try {
    const { stdout } = await execAsync(
      `pdftotext -layout -q "${absolutePath}" -`,
      { maxBuffer: 10 * 1024 * 1024 },
    );
    const text = stdout.trim();
    if (text.length > 0) {
      return {
        text: truncate(text),
        method: "pdftotext",
        ocrPages: 0,
      };
    }
    // Empty output → scanned PDF (no text layer). Fall through to OCR.
  } catch (err) {
    // pdftotext failed (corrupt PDF? missing binary?). If useOcr, try OCR
    // anyway — it might work where pdftotext didn't. If not, return null.
    console.error("[text-extraction] pdftotext error:", err);
    if (!useOcr) {
      return { text: null, method: null, ocrPages: 0 };
    }
  }

  // --- Step 2: OCR fallback (if enabled) ---------------------------------
  if (!useOcr) {
    // pdftotext returned empty + OCR not requested → return null.
    // This is the upload-route path: scanned PDFs get textContent=null
    // until the Registrar manually triggers OCR via the extract-text route.
    return { text: null, method: null, ocrPages: 0 };
  }

  const ocrResult = await extractTextFromPdfViaOcr(absolutePath);
  return ocrResult;
}

/**
 * OCR a scanned PDF: convert pages to PNGs via pdftoppm, then OCR each
 * PNG via tesseract. Concatenate the per-page text.
 *
 * SLOW: 30-60 seconds for a 10-page scanned PDF. Only call this from
 * contexts that expect it to be slow (manual extract-text route, backfill
 * script) — never from the upload route's synchronous auto-extraction.
 */
async function extractTextFromPdfViaOcr(absolutePath: string): Promise<ExtractResult> {
  // Create a unique temp dir for this OCR run. Using a dir (not a prefix)
  // makes cleanup a single rmdir call.
  const tmpDir = path.join(os.tmpdir(), `urm-ocr-${Date.now()}-${randomId()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // --- 2a. Convert PDF pages to PNGs via pdftoppm ----------------------
    // pdftoppm outputs files named like "page-1.png", "page-2.png", ...
    // -png: output PNG format
    // -r 300: 300 DPI (good for OCR)
    // -l 10: limit to first 10 pages (MAX_OCR_PAGES)
    const outputPrefix = path.join(tmpDir, "page");
    try {
      await execAsync(
        `pdftoppm -png -r ${OCR_DPI} -l ${MAX_OCR_PAGES} "${absolutePath}" "${outputPrefix}"`,
        { maxBuffer: 50 * 1024 * 1024 }, // 50 MB buffer — PNGs can be large
      );
    } catch (err) {
      console.error("[text-extraction] pdftoppm error:", err);
      return { text: null, method: null, ocrPages: 0 };
    }

    // --- 2b. List the generated PNG files (sorted by page number) --------
    const files = await fs.readdir(tmpDir);
    const pngFiles = files
      .filter((f) => f.endsWith(".png"))
      .sort((a, b) => {
        // Natural sort by page number: "page-1.png" < "page-2.png" < "page-10.png"
        const numA = parseInt(a.match(/(\d+)\.png$/)?.[1] ?? "0", 10);
        const numB = parseInt(b.match(/(\d+)\.png$/)?.[1] ?? "0", 10);
        return numA - numB;
      });

    if (pngFiles.length === 0) {
      // pdftoppm produced no PNGs — the PDF might be empty or corrupt
      console.warn("[text-extraction] pdftoppm produced no PNG files for:", absolutePath);
      return { text: null, method: null, ocrPages: 0 };
    }

    // --- 2c. OCR each PNG via tesseract ----------------------------------
    const pageTexts: string[] = [];
    for (const pngFile of pngFiles) {
      const pngPath = path.join(tmpDir, pngFile);
      try {
        const { stdout } = await execAsync(
          `tesseract "${pngPath}" stdout -l eng --psm 6 2>/dev/null`,
          { maxBuffer: 10 * 1024 * 1024 },
        );
        const pageText = stdout.trim();
        if (pageText.length > 0) {
          pageTexts.push(pageText);
        }
      } catch (err) {
        // A single page failing OCR shouldn't fail the whole document —
        // log + continue to the next page.
        console.error(`[text-extraction] tesseract error on ${pngFile}:`, err);
      }
    }

    // --- 2d. Concatenate + return ----------------------------------------
    if (pageTexts.length === 0) {
      // OCR produced no text on any page — the PDF might be empty pages
      // or tesseract failed on all of them
      return { text: null, method: null, ocrPages: pngFiles.length };
    }

    const fullText = pageTexts.join("\n\n--- Page Break ---\n\n");
    return {
      text: truncate(fullText),
      method: "ocr",
      ocrPages: pngFiles.length,
    };
  } finally {
    // --- Cleanup: remove the temp dir + all PNGs --------------------------
    // Always run, even if OCR failed partway through. rmdir with recursive
    // + force handles non-empty dirs.
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Cleanup failure is non-fatal — the OS will clean /tmp eventually.
    }
  }
}

/**
 * OCR a single image file (PNG/JPG) via tesseract.
 * Used for direct image uploads (not PDFs).
 */
async function ocrImage(absolutePath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `tesseract "${absolutePath}" stdout -l eng --psm 6 2>/dev/null`,
      { maxBuffer: 10 * 1024 * 1024 },
    );
    const text = stdout.trim();
    return text.length > 0 ? truncate(text) : null;
  } catch (err) {
    console.error("[text-extraction] tesseract error:", err);
    return null;
  }
}

/**
 * Truncate text to MAX_TEXT_LENGTH with a truncation marker.
 * Same behavior as the original pdftotext path.
 */
function truncate(text: string): string {
  if (text.length > MAX_TEXT_LENGTH) {
    return text.slice(0, MAX_TEXT_LENGTH) + "\n... [truncated]";
  }
  return text;
}

/**
 * Generate a short random ID for temp dir uniqueness.
 * Uses crypto.randomBytes (no external dep).
 */
function randomId(): string {
  return createHash("md5").update(String(Date.now()) + Math.random()).digest("hex").slice(0, 8);
}
