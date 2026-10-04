#!/usr/bin/env python3
"""
Render an HTML string to PDF using WeasyPrint.

Reads HTML from stdin, writes PDF to the specified output file.
WeasyPrint handles @page rules, page breaks, CSS styling, + tables natively.

Usage:
  echo "<html>..." | python3 scripts/render-pdf.py --output /path/to/report.pdf

Or with a file:
  python3 scripts/render-pdf.py --output /path/to/report.pdf --input /tmp/report.html
"""

import sys
import argparse
from weasyprint import HTML

def main():
    parser = argparse.ArgumentParser(description='Render HTML to PDF via WeasyPrint')
    parser.add_argument('--output', required=True, help='Output PDF file path')
    parser.add_argument('--input', help='Input HTML file (if not provided, reads from stdin)')
    args = parser.parse_args()

    if args.input:
        with open(args.input, 'r', encoding='utf-8') as f:
            html_content = f.read()
    else:
        html_content = sys.stdin.read()

    HTML(string=html_content).write_pdf(args.output)
    print(f"PDF generated: {args.output}", file=sys.stderr)

if __name__ == '__main__':
    main()
