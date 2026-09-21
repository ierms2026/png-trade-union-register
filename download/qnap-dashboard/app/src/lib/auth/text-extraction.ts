import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { promises as fs } from "node:fs";

const execAsync = promisify(exec);

// =============================================================================
// Text extraction utilities — extract searchable text from uploaded documents.
//
// Strategy:
//   1. PDF files → use system `pdftotext` command (poppler-utils)
//   2. Image files → skip (would need tesseract.js for OCR)
//   3. Other files → no extraction (textContent stays null)
//
// Why pdftotext:
//   - Fast, reliable, handles ALL PDF types (born-digital + scanned with text layer)
//   - No JS dependencies, no worker issues, no import problems
//   - Available on the server (poppler-utils package)
//   - Same tool used by Elasticsearch/Lucene for PDF indexing
// =============================================================================

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");

export async function extractTextFromFile(
  filePath: string,
  fileExtension: string | null,
): Promise<string | null> {
  const absolutePath = path.join(STORAGE_ROOT, filePath);
  const ext = fileExtension?.toLowerCase();

  try {
    if (ext === ".pdf") {
      return await extractTextFromPdf(absolutePath);
    }
    // Image files would need OCR — not implemented yet
    return null;
  } catch (err) {
    console.error(`[text-extraction] Failed to extract from ${filePath}:`, err);
    return null;
  }
}

async function extractTextFromPdf(absolutePath: string): Promise<string | null> {
  try {
    // Use pdftotext to extract text to stdout
    // -layout: preserve the original layout
    // -q: suppress error messages (we handle errors ourselves)
    const { stdout } = await execAsync(
      `pdftotext -layout -q "${absolutePath}" -`,
      { maxBuffer: 10 * 1024 * 1024 }, // 10 MB buffer for large PDFs
    );

    const text = stdout.trim();
    if (text.length === 0) {
      // Scanned PDF with no text layer — would need OCR
      return null;
    }

    // Truncate to 50,000 chars (~10 pages) to keep SQLite fast
    const MAX_TEXT_LENGTH = 50_000;
    if (text.length > MAX_TEXT_LENGTH) {
      return text.slice(0, MAX_TEXT_LENGTH) + "\n... [truncated]";
    }

    return text;
  } catch (err) {
    console.error("[text-extraction] pdftotext error:", err);
    return null;
  }
}
