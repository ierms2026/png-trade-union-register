#!/usr/bin/env python3
"""
Generate a real PDF for a demo document.

Two modes:
  --mode born-digital  : PDF with a text layer (pdftotext extracts it instantly)
  --mode scanned       : Image-only PDF (no text layer — needs OCR)

The text content is passed via stdin (to avoid shell-escaping issues with
long multi-line text). The script reads it, renders it into the PDF, and
writes the PDF to the output path.

Usage:
  echo "<text content>" | python3 scripts/generate-demo-pdf.py \\
      --output <path> \\
      --mode born-digital|scanned \\
      --title "<title for the PDF header>"

Born-digital mode uses reportlab's canvas.drawString (creates a real text
layer). Scanned mode uses PIL to render the text as a PNG image, then wraps
it in a PDF (no text layer — pdftotext returns empty, OCR is required).
"""

import sys
import os
import tempfile
import argparse
from io import StringIO

def generate_born_digital(output_path: str, title: str, text: str):
    """Generate a PDF with a real text layer (pdftotext can extract it)."""
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.units import inch

    c = canvas.Canvas(output_path, pagesize=letter)
    width, height = letter  # 612 x 792 points

    # Header
    c.setFont("Helvetica-Bold", 16)
    c.drawString(1 * inch, 10.5 * inch, title)
    c.setFont("Helvetica", 10)
    c.drawString(1 * inch, 10.2 * inch, "Industrial Registrar — Register of Trade Unions")
    c.line(1 * inch, 10.1 * inch, width - 1 * inch, 10.1 * inch)

    # Body text with word wrapping
    c.setFont("Helvetica", 11)
    y = 9.5 * inch
    margin = 1 * inch
    max_width = width - 2 * margin
    line_height = 16

    for paragraph in text.split('\n'):
        if not paragraph.strip():
            y -= line_height // 2
            continue
        words = paragraph.split()
        line = ''
        for word in words:
            test = (line + ' ' + word).strip()
            if c.stringWidth(test, "Helvetica", 11) <= max_width:
                line = test
            else:
                if y < 1 * inch:
                    c.showPage()
                    c.setFont("Helvetica", 11)
                    y = 10 * inch
                c.drawString(margin, y, line)
                y -= line_height
                line = word
        if line:
            if y < 1 * inch:
                c.showPage()
                c.setFont("Helvetica", 11)
                y = 10 * inch
            c.drawString(margin, y, line)
            y -= line_height
        y -= line_height // 2

    c.showPage()
    c.save()


def generate_scanned(output_path: str, title: str, text: str):
    """Generate an image-only PDF (no text layer — needs OCR)."""
    from PIL import Image, ImageDraw, ImageFont
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter

    # Create a white image (8.5x11 inches at 150 DPI = 1275x1650)
    width, height = 1275, 1650
    img = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(img)

    # Load fonts
    try:
        font_title = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 28)
        font_body = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 24)
        font_small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 16)
    except (IOError, OSError):
        font_title = ImageFont.load_default()
        font_body = ImageFont.load_default()
        font_small = ImageFont.load_default()

    margin = 120
    y = margin
    max_width = width - 2 * margin

    # Header
    draw.text((margin, y), title, fill='black', font=font_title)
    y += 40
    draw.text((margin, y), "Industrial Registrar — Register of Trade Unions", fill='black', font=font_small)
    y += 30
    draw.line([(margin, y), (width - margin, y)], fill='black', width=2)
    y += 40

    # Body text with word wrapping
    for paragraph in text.split('\n'):
        if not paragraph.strip():
            y += 20
            continue
        words = paragraph.split()
        line = ''
        for word in words:
            test = (line + ' ' + word).strip()
            bbox = draw.textbbox((0, 0), test, font=font_body)
            if bbox[2] - bbox[0] <= max_width:
                line = test
            else:
                draw.text((margin, y), line, fill='black', font=font_body)
                y += 34
                if y > height - margin:
                    break
                line = word
        if y > height - margin:
            break
        if line:
            draw.text((margin, y), line, fill='black', font=font_body)
            y += 34
        y += 12

    # Save as PNG, then wrap in a PDF (image-only — no text layer)
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
        img.save(tmp.name, 'PNG')
        png_path = tmp.name

    try:
        c = canvas.Canvas(output_path, pagesize=letter)
        c.drawImage(png_path, 0, 0, width=612, height=792)
        c.showPage()
        c.save()
    finally:
        os.unlink(png_path)


def main():
    parser = argparse.ArgumentParser(description='Generate a demo PDF')
    parser.add_argument('--output', required=True, help='Output PDF path')
    parser.add_argument('--mode', required=True, choices=['born-digital', 'scanned'],
                        help='PDF mode: born-digital (text layer) or scanned (image-only)')
    parser.add_argument('--title', required=True, help='Title for the PDF header')
    parser.add_argument('--text-file', required=True, help='Path to a file containing the text content')
    args = parser.parse_args()

    # Read text content from the specified file
    with open(args.text_file, 'r', encoding='utf-8') as f:
        text = f.read()

    if args.mode == 'born-digital':
        generate_born_digital(args.output, args.title, text)
    else:
        generate_scanned(args.output, args.title, text)

    print(f"Generated {args.mode} PDF: {args.output} ({os.path.getsize(args.output)} bytes)")


if __name__ == '__main__':
    main()
