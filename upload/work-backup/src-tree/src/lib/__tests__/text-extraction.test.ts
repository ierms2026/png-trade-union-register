import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { extractTextFromFileWithMeta } from "../auth/text-extraction";

// =============================================================================
// Chunk 7 — text-extraction OCR tests.
//
// These are INTEGRATION tests — they require pdftotext, pdftoppm, + tesseract
// to be installed on the host. They create real test files in the OS temp
// dir, run extraction, and verify the OCR fallback works end-to-end.
//
// If the system tools aren't installed, the tests that need them are SKIPPED
// (not failed) — the test suite stays green on dev boxes without OCR support.
// =============================================================================

const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");

// Check if the required system tools are available. Cache the result so we
// don't shell out on every test.
let toolsAvailable: boolean | null = null;
async function checkTools(): Promise<boolean> {
  if (toolsAvailable !== null) return toolsAvailable;
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);
  try {
    await execAsync("which pdftotext pdftoppm tesseract");
    toolsAvailable = true;
  } catch {
    toolsAvailable = false;
  }
  return toolsAvailable;
}

// Helper: create a PNG image with text, then wrap it in a PDF (image-only,
// no text layer). Requires Pillow (Python). If Pillow isn't available, the
// test is skipped.
async function createScannedPdf(outputPath: string, text: string): Promise<boolean> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);
  const pythonScript = `
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import tempfile, os, sys

img = Image.new('RGB', (1275, 1650), 'white')
draw = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 32)
except:
    font = ImageFont.load_default()

margin = 100
y = margin
max_width = 1275 - 2 * margin
for paragraph in sys.argv[2].split('\\n'):
    words = paragraph.split()
    if not words:
        y += 48
        continue
    line = ''
    for word in words:
        test = (line + ' ' + word).strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            line = test
        else:
            draw.text((margin, y), line, fill='black', font=font)
            y += 48
            line = word
    if line:
        draw.text((margin, y), line, fill='black', font=font)
        y += 48
    y += 24

with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
    img.save(tmp.name, 'PNG')
    png_path = tmp.name

c = canvas.Canvas(sys.argv[1], pagesize=letter)
c.drawImage(png_path, 0, 0, width=612, height=792)
c.showPage()
c.save()
os.unlink(png_path)
`;
  try {
    await execAsync(`python3 -c '${pythonScript.replace(/'/g, "'\\''")}' '${outputPath}' '${text.replace(/'/g, "'\\''")}'`);
    return true;
  } catch {
    return false;
  }
}

describe("text-extraction OCR fallback (chunk 7)", () => {
  it("pdftotext path: returns text from a born-digital PDF without OCR", async () => {
    if (!(await checkTools())) return; // skip if tools missing

    // Create a real born-digital PDF (with text layer) using reportlab directly.
    // This PDF has extractable text — pdftotext should get it, no OCR needed.
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    const testPdf = path.join(STORAGE_ROOT, "test-born-digital.pdf");
    const pythonScript = `
from reportlab.pdfgen import canvas
c = canvas.Canvas('${testPdf}')
c.drawString(100, 750, 'This is a born-digital PDF with a secret ballot clause.')
c.showPage()
c.save()
`;
    try {
      await execAsync(`python3 -c '${pythonScript}'`);
    } catch {
      return; // skip if reportlab missing
    }

    try {
      // useOcr: false — should still work (pdftotext path)
      const result = await extractTextFromFileWithMeta("test-born-digital.pdf", ".pdf", { useOcr: false });
      expect(result.method).toBe("pdftotext");
      expect(result.text).toContain("secret ballot");
      expect(result.ocrPages).toBe(0);
    } finally {
      await fs.unlink(testPdf).catch(() => {});
    }
  });

  it("OCR fallback: extracts text from a scanned PDF (image-only, no text layer)", async () => {
    if (!(await checkTools())) return; // skip if tools missing

    const testPdf = path.join(STORAGE_ROOT, "test-scanned-ocr.pdf");
    const testText = "This scanned document mentions secret ballot and award variation in the constitution.";
    const created = await createScannedPdf(testPdf, testText);
    if (!created) return; // skip if PIL/reportlab missing

    try {
      // First verify pdftotext returns empty (confirming it's truly image-only)
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(exec);
      try {
        const { stdout } = await execAsync(`pdftotext -layout -q "${testPdf}" -`);
        expect(stdout.trim().length).toBe(0);
      } catch {
        // pdftotext might fail entirely on some image-only PDFs — that's fine
      }

      // useOcr: false → should return null (pdftotext returns empty, no OCR)
      const noOcrResult = await extractTextFromFileWithMeta("test-scanned-ocr.pdf", ".pdf", { useOcr: false });
      expect(noOcrResult.text).toBeNull();
      expect(noOcrResult.method).toBeNull();

      // useOcr: true → should fall back to OCR + extract text
      const ocrResult = await extractTextFromFileWithMeta("test-scanned-ocr.pdf", ".pdf", { useOcr: true });
      expect(ocrResult.method).toBe("ocr");
      expect(ocrResult.ocrPages).toBeGreaterThan(0);
      expect(ocrResult.text).not.toBeNull();
      // OCR should recognize the key phrases (allowing for minor OCR errors
      // + line breaks from word wrapping — normalize whitespace before checking)
      const text = ocrResult.text!.toLowerCase().replace(/\s+/g, " ");
      expect(text).toContain("secret ballot");
      expect(text).toContain("award variation");
    } finally {
      await fs.unlink(testPdf).catch(() => {});
    }
  });

  it("useOcr: false (default) skips OCR even for scanned PDFs", async () => {
    if (!(await checkTools())) return;

    const testPdf = path.join(STORAGE_ROOT, "test-no-ocr-skip.pdf");
    const created = await createScannedPdf(testPdf, "This document has a secret ballot clause.");
    if (!created) return;

    try {
      const result = await extractTextFromFileWithMeta("test-no-ocr-skip.pdf", ".pdf", { useOcr: false });
      // pdftotext returns empty for scanned PDFs; with useOcr=false, we return null
      expect(result.text).toBeNull();
      expect(result.method).toBeNull();
      expect(result.ocrPages).toBe(0);
    } finally {
      await fs.unlink(testPdf).catch(() => {});
    }
  });

  it("returns null for unsupported file types (e.g., .docx)", async () => {
    const result = await extractTextFromFileWithMeta("nonexistent.docx", ".docx", { useOcr: true });
    expect(result.text).toBeNull();
    expect(result.method).toBeNull();
  });

  it("returns null for nonexistent files", async () => {
    const result = await extractTextFromFileWithMeta("nonexistent-file-12345.pdf", ".pdf", { useOcr: true });
    expect(result.text).toBeNull();
    expect(result.method).toBeNull();
  });
});
