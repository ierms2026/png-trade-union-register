"""Add mode: "insensitive" to all Prisma contains filters missing it."""
import re
from pathlib import Path

SRC = Path("/home/z/my-project/src/app/api")
count = [0]

def add_mode(match):
    full = match.group(0)
    if "mode:" in full:
        return full
    count[0] += 1
    return full[:-1] + ', mode: "insensitive" }'

for ts_file in sorted(SRC.rglob("*.ts")):
    src = ts_file.read_text()
    original = src
    src = re.sub(r'contains:\s*[^{}]+?\s*\}', add_mode, src)
    if src != original:
        ts_file.write_text(src)
        print(f"  ✓ {ts_file.relative_to(SRC)}")

print(f"\nDone: {count[0]} filters updated.")
