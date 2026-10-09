# BK0 Recovery Backup — 2026-10-09

## Metadata

```
BASE:     01f47e2772ea22240c32806fe0de6f95571bc2c1
HEAD:     5b3a0c996172748aabe34468859973a065c7a701
TREE:     d44988e93e671e789086f6be420513e8bf5b198b
Commits:  14 (base..HEAD, no merges)
```

## Artifacts

| File | Size | SHA-256 |
|------|------|---------|
| `bk0-all-refs.bundle` | 86 MB | `b73ed02485949a1b631c026268ebe3bb5d44f8b5df41e389345955160341dac6` |
| `bk0-patch-series.mbox` | 1019 KB | `b02732a27b555614c3acbbe0905ce5d4e65c37c543b2647f7f28c5f0415e7e23` |

## Verification (PowerShell)

```powershell
cd C:\Users\OIR2\backup-test\2026-10-09
Get-FileHash bk0-all-refs.bundle -Algorithm SHA256
# Expected: b73ed02485949a1b631c026268ebe3bb5d44f8b5df41e389345955160341dac6
Get-FileHash bk0-patch-series.mbox -Algorithm SHA256
# Expected: b02732a27b555614c3acbbe0905ce5d4e65c37c543b2647f7f28c5f0415e7e23
```

## Restore test (Git for Windows)

```powershell
git clone bk0-all-refs.bundle test-restore
cd test-restore
git log --oneline -1
# Expected: 5b3a0c9 B6: harden registrar-only API route authorization
git rev-parse HEAD^{tree}
# Expected: d44988e93e671e789086f6be420513e8bf5b198b
```

## Session commit chain (base..HEAD)

| # | SHA | Subject |
|---|-----|---------|
| 1 | 86b528d | phase0: add verified usability gap register |
| 2 | 7fcf347 | phase1: add ClickableRow component (U-03, U-04) |
| 3 | 3755b5d | phase1: add Field wrapper with aria-invalid/aria-describedby wiring (U-14, U-15) |
| 4 | c38f4d2 | phase1: add ConfirmDialog with type-to-confirm + async + destructive mode (U-02) |
| 5 | 2a92c6d | (automated) worklog entry for A1 |
| 6 | 973d6cd | B1: delete /portal dead code and add migration doc |
| 7 | 94339a2 | (automated) tool-results cleanup |
| 8 | 3d4788d | B2: add pre-flight check script and runbook section |
| 9 | d93caf0 | (automated) B3 prior work (confirm-dialog + retention.tsx) |
| 10 | 249ccd2 | B3: migrate retention disposal dialog to shared ConfirmDialog |
| 11 | 73a0a47 | (automated) B4 label-source-guard test file |
| 12 | 950ee75 | B4: add label-source guard and fix 4 hardcoded label violations |
| 13 | 3baad47 | B5: align report compliance rate with shared helper |
| 14 | 5b3a0c9 | B6: harden registrar-only API route authorization |
