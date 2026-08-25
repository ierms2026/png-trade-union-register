#!/usr/bin/env bash
# =============================================================================
# cron.sh — cron invocation guide for the Union Records Management System.
#
# Schedules the two automated sweep endpoints:
#   1. POST /api/cron/compliance-sweep — daily at 8:00 AM
#   2. POST /api/cron/audit-retention-sweep — weekly (Sunday 2:00 AM)
#
# PREREQUISITES:
#   1. Set CRON_SECRET in .env: openssl rand -hex 32
#   2. Restart the dev server so it picks up the new env var.
#   3. The app must be running and reachable from the cron host.
#
# USAGE:
#   ./scripts/cron.sh compliance    — run the compliance sweep now
#   ./scripts/cron.sh audit         — run the audit retention sweep now
#   ./scripts/cron.sh crontab       — print the crontab lines to install
#   ./scripts/cron.sh help          — print this help
# =============================================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
SECRET_FILE="${SECRET_FILE:-$HOME/.urm-cron-secret}"

print_help() { sed -n '2,30p' "$0"; }

print_crontab() {
  cat << EOF
# =============================================================================
# Union Records Management — crontab entries
# Install with: crontab -e  (then paste the lines below)
# =============================================================================

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
BASE_URL=$BASE_URL

# --- Compliance sweep: daily at 8:00 AM ---
0 8 * * * $0 compliance >> /var/log/urm-compliance-sweep.log 2>&1

# --- Audit retention sweep: every Sunday at 2:00 AM ---
0 2 * * 0 $0 audit >> /var/log/urm-audit-sweep.log 2>&1

# =============================================================================
# LOG ROTATION (recommended):
# /var/log/urm-compliance-sweep.log /var/log/urm-audit-sweep.log {
#   weekly rotate 12 compress missingok notifempty create 640 root adm
# }
# =============================================================================
EOF
}

case "${1:-help}" in
  crontab) print_crontab; exit 0 ;;
  help|--help|-h) print_help; exit 0 ;;
  compliance|audit) : ;;
  *)
    echo "Usage: $0 {compliance|audit|crontab|help}" >&2
    echo "  compliance  — run the compliance sweep now" >&2
    echo "  audit       — run the audit retention sweep now" >&2
    echo "  crontab     — print the crontab lines to install" >&2
    echo "  help        — print the setup instructions" >&2
    exit 1
    ;;
esac

if [[ -f "$SECRET_FILE" ]]; then
  CRON_SECRET="${CRON_SECRET:-$(cat "$SECRET_FILE")}"
fi

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "ERROR: CRON_SECRET is not set." >&2
  echo "  1. echo -n 'your-secret' > $SECRET_FILE && chmod 600 $SECRET_FILE" >&2
  echo "  2. Or: CRON_SECRET=your-secret $0 $1" >&2
  echo "Generate with: openssl rand -hex 32" >&2
  exit 1
fi

run_sweep() {
  local endpoint="$1"
  echo "Running $endpoint sweep against $BASE_URL..."
  curl -s -X POST \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json" \
    "$BASE_URL/api/cron/$endpoint"
  echo
}

case "${1:-}" in
  compliance) run_sweep "compliance-sweep" ;;
  audit) run_sweep "audit-retention-sweep" ;;
esac
