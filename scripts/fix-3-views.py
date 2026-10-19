"""Fix the 3 high-traffic views: Compliance, Documents, Unions detail.

1. Compliance: move the matrix ABOVE the charts (the matrix IS the view)
2. Documents: establish card hierarchy (file name primary, union secondary, meta tertiary)
3. Unions detail: demote Upload Document button + strengthen tab bar active state
"""
import re
from pathlib import Path

VIEWS = Path("/home/z/my-project/src/components/app/views")

# =============================================================================
# Fix 1: Compliance — move matrix above charts
# =============================================================================
compliance = (VIEWS / "compliance.tsx").read_text()

if "=== Matrix (PRIMARY — moved above charts per design review) ===" not in compliance:
    # Extract the charts row block (from "{/* Charts row */}" to the closing "</div>" before "{/* Matrix */}")
    charts_start = compliance.index("      {/* Charts row */}")
    matrix_start = compliance.index("      {/* Matrix */}")
    # The charts row ends at the line before the matrix comment
    charts_block = compliance[charts_start:matrix_start]

    # Extract the matrix block (from "{/* Matrix */}" to the closing "</Card>" + blank line before the next section)
    # The matrix Card ends with </Card> followed by a blank line + the closing </div> of the component
    matrix_end_marker = "      </Card>\n    </div>\n  );\n}"
    matrix_end = compliance.index(matrix_end_marker, matrix_start) + len("      </Card>\n")
    matrix_block = compliance[matrix_start:matrix_end]

    # Remove both blocks from their current positions
    remaining = compliance[:charts_start] + compliance[matrix_end:]

    # Re-insert in the new order: matrix first, then charts
    new_section = (
        "      {/* Matrix (PRIMARY — moved above charts per design review) ===\n"
        "          The matrix IS the compliance view. Charts are supplementary.\n"
        "          Was: charts first (ate above-the-fold), matrix below. Now:\n"
        "          matrix first, charts below. */}\n"
        + matrix_block.replace("      {/* Matrix */}", "      {/* Matrix — the live compliance grid */}")
        + "\n\n"
        + "      {/* Charts row (supplementary — moved below the matrix per design review) */}\n"
        + charts_block.replace("      {/* Charts row */}", "")
    )

    compliance = remaining[:charts_start] + new_section + remaining[charts_start:]
    (VIEWS / "compliance.tsx").write_text(compliance)
    print("✓ Compliance: matrix moved above charts")
else:
    print("  Compliance: already fixed — skip")

# =============================================================================
# Fix 2: Documents — establish card hierarchy
# =============================================================================
documents = (VIEWS / "documents.tsx").read_text()

if "Design review: card hierarchy" not in documents:
    # The document card has the file name + union name + metadata all at similar weight.
    # Find the card content structure + restructure it.
    # Current pattern (around line 300-350):
    #   <p className="font-medium">{doc.documentType}</p>
    #   <p className="text-sm text-muted-foreground">{doc.union.unionName}</p>
    #   <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
    #     <span>File: {doc.latestVersion.fileName}...</span>
    #     ...more meta...
    #   </div>
    #
    # The issue: documentType is font-medium, unionName is text-sm muted — but they're
    # too close in weight. The meta is text-xs which is OK. Fix: make documentType
    # text-base font-semibold (clearly primary), unionName text-sm text-muted-foreground
    # (clearly secondary).

    old_card_content = '<p className="font-medium">{doc.documentType}</p>'
    new_card_content = '<p className="text-base font-semibold">{doc.documentType}</p>'
    if old_card_content in documents:
        documents = documents.replace(old_card_content, new_card_content)
        (VIEWS / "documents.tsx").write_text(documents)
        print("✓ Documents: card hierarchy fixed (documentType → text-base font-semibold)")
    else:
        print("  Documents: pattern not found — manual review needed")
else:
    print("  Documents: already fixed — skip")

# =============================================================================
# Fix 3: Unions detail — demote Upload button + strengthen tab active state
# =============================================================================
unions = (VIEWS / "unions.tsx").read_text()

if "Design review: demote Upload button" not in unions:
    # 3a: Demote the Upload Document button from variant="default" to variant="outline"
    # The union name should be the focal point, not the button.
    old_upload_btn = '<Button onClick={() => setUploadDialogOpen(true)} className="gap-2">'
    new_upload_btn = '<Button variant="outline" onClick={() => setUploadDialogOpen(true)} className="gap-2">'
    if old_upload_btn in unions:
        unions = unions.replace(old_upload_btn, new_upload_btn, 1)
        print("  ✓ Unions: Upload button demoted to outline")
    else:
        print("  Unions: upload button pattern not found — may already be outline")

    # 3b: Strengthen the tab bar's active state
    # Current active: "bg-accent/10 text-primary" — too subtle
    # New active: "bg-primary text-primary-foreground" — clearly distinct
    old_active = '"bg-accent/10 text-primary"'
    new_active = '"bg-primary text-primary-foreground"'
    if old_active in unions:
        unions = unions.replace(old_active, new_active)
        print("  ✓ Unions: tab active state strengthened (accent/10 → primary)")
    else:
        print("  Unions: tab active pattern not found")

    if "Design review: demote Upload button" not in unions:
        # Add a comment marker for idempotency
        unions = unions.replace(
            '<Button variant="outline" onClick={() => setUploadDialogOpen(true)}',
            '{/* Design review: demote Upload button — union name should be the focal point, not the CTA */}\n          <Button variant="outline" onClick={() => setUploadDialogOpen(true)}',
            1
        )

    (VIEWS / "unions.tsx").write_text(unions)
else:
    print("  Unions: already fixed — skip")

print("\nDone.")
