import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const execFileP = promisify(execFile);

// =============================================================================
// File validation helpers — primarily for PDF integrity checking.
//
// WHY MAGIC-BYTES + PDFINFO:
//   - The upload route accepts any file extension, but PDFs are by far the
//     most common document type (constitutions, bylaws, annual returns are
//     all PDFs). A corrupt PDF — truncated upload, network garble, a .doc
//     renamed to .pdf — would otherwise be stored, linked to a Document
//     row, and only discovered broken when a user tries to open it. By
//     then, the audit trail has moved on and the bad file is a paper trail.
//   - Magic bytes (`%PDF-`) is a cheap pre-check: catches the obvious
//     "wrong file type renamed" case in O(1) without spawning a process.
//   - `pdfinfo` (from poppler-utils) does a structural integrity check:
//     parses the cross-reference table, verifies the trailer, etc. A
//     truncated PDF with the right magic bytes will fail here.
//
// WHY NOT pdftotext:
//   - `pdftotext` extracts text, which we don't need at upload time.
//     `pdfinfo` is faster (no text extraction) and tests the same
//     structural integrity.
//   - We may use `pdftotext` later for a full-text-search feature, but
//     that's out of scope for upload validation.
//
// GRACEFUL DEGRADATION:
//   If `pdfinfo` isn't installed on the host (e.g. local dev without
//   poppler-utils), `validatePdfIntegrity` returns `true` (accept) and
//   logs a warning. This avoids making the upload route hard-fail in
//   environments where the binary is missing — the magic-bytes check
//   still runs as a baseline.
// =============================================================================

/** PDF magic bytes — every valid PDF starts with `%PDF-`. */
const PDF_MAGIC = Buffer.from("%PDF-");

/**
 * Quick magic-bytes check: does the buffer start with the PDF signature?
 *
 * This catches the common "wrong file type renamed to .pdf" case without
 * spawning a process. NOT a full integrity check — see
 * `validatePdfIntegrity` for that.
 */
export function hasPdfMagicBytes(buffer: Buffer): boolean {
  return buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
}

let pdfinfoAvailable: boolean | null = null;

/**
 * Probe whether `pdfinfo` is installed on the host. Cached after the first
 * call — the binary won't appear/disappear during a process lifetime.
 */
async function isPdfinfoAvailable(): Promise<boolean> {
  if (pdfinfoAvailable !== null) return pdfinfoAvailable;
  try {
    await execFileP("pdfinfo", ["-v"]);
    pdfinfoAvailable = true;
  } catch {
    // pdfinfo -v returns non-zero on success in some versions but still
    // prints version info. A ENOENT means the binary isn't installed.
    pdfinfoAvailable = false;
  }
  return pdfinfoAvailable;
}

/**
 * Validate a PDF file's structural integrity by running `pdfinfo` on it.
 *
 * Writes the buffer to a temp file (pdfinfo needs a path, doesn't read
 * stdin), runs `pdfinfo -meta` (any subcommand would do — we just want
 * the parse to succeed or fail), and cleans up the temp file.
 *
 * @param buffer  The PDF file content.
 * @returns       `true` if pdfinfo parsed the file successfully (or if
 *                pdfinfo isn't installed — graceful degradation).
 *                `false` if pdfinfo is installed but failed to parse
 *                (corrupt PDF).
 */
export async function validatePdfIntegrity(buffer: Buffer): Promise<boolean> {
  if (!(await isPdfinfoAvailable())) {
    console.warn(
      "[file-validation] pdfinfo not installed — skipping PDF integrity check. " +
        "Install poppler-utils for full validation.",
    );
    return true;
  }

  // Write to a temp file in the OS temp dir. Use mkdtemp to get a unique
  // directory per call — avoids collisions if two uploads run concurrently.
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-check-"));
  const tmpFile = path.join(tmpDir, "upload.pdf");
  try {
    await fs.writeFile(tmpFile, buffer);
    // pdfinfo returns 0 on success, non-zero on parse failure.
    // We don't care about the stdout — just the exit code.
    await execFileP("pdfinfo", [tmpFile], { timeout: 5000 });
    return true;
  } catch {
    return false;
  } finally {
    // Always clean up the temp directory, even on success.
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors — temp files are in the OS temp dir, which
      // the OS will eventually clean up on its own.
    }
  }
}
