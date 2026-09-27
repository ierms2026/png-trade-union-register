#!/usr/bin/env python3
"""
Create a real "scanned" PDF (image-only, no text layer) for OCR testing.

Generates a PNG image with text rendered into it, then wraps that PNG into
a PDF. The resulting PDF has NO text layer — pdftotext returns empty, so
OCR (pdftoppm + tesseract) is required to extract the text.

Usage:
  python3 scripts/make-scanned-pdf.py <output.pdf> "<text to embed>"

The text is rendered as an image (white background, black text). Tesseract
should recognize it with high accuracy.
"""

import sys
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import tempfile
import os

def make_scanned_pdf(output_path: str, text: str):
    # Create a white image (8.5x11 inches at 150 DPI = 1275x1650)
    width, height = 1275, 1650
    img = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(img)

    # Load a font (use a system font; fall back to default if not found)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 32)
    except (IOError, OSError):
        font = ImageFont.load_default()

    # Render the text with word wrapping
    margin = 100
    y = margin
    max_width = width - 2 * margin
    line_height = 48

    for paragraph in text.split('\n'):
        words = paragraph.split()
        if not words:
            y += line_height
            continue
        line = ''
        for word in words:
            test = (line + ' ' + word).strip()
            bbox = draw.textbbox((0, 0), test, font=font)
            if bbox[2] - bbox[0] <= max_width:
                line = test
            else:
                draw.text((margin, y), line, fill='black', font=font)
                y += line_height
                line = word
                if y > height - margin:
                    break
        if y > height - margin:
            break
        if line:
            draw.text((margin, y), line, fill='black', font=font)
            y += line_height
        y += line_height // 2  # paragraph spacing

    # Save the image as a PNG
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
        img.save(tmp.name, 'PNG')
        png_path = tmp.name

    try:
        # Create a PDF with the image as a full-page image (no text layer)
        c = canvas.Canvas(output_path, pagesize=letter)
        # Letter size in points: 612 x 792
        c.drawImage(png_path, 0, 0, width=612, height=792)
        c.showPage()
        c.save()
    finally:
        os.unlink(png_path)

    print(f"Created scanned PDF: {output_path}")
    print(f"  File size: {os.path.getsize(output_path)} bytes")

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python3 scripts/make-scanned-pdf.py <output.pdf> '<text>'")
        sys.exit(1)
    make_scanned_pdf(sys.argv[1], sys.argv[2])
