#!/usr/bin/env bash
# =============================================================================
# cron-runner.sh — lightweight in-process cron scheduler.
#
# This environment doesn't have a cron daemon (no crontab command), so this
# script acts as a simple timer-based scheduler. It runs in the background
# + fires the cron endpoints at their scheduled times.
#
# SCHEDULE (matches scripts/cron.sh crontab output):
#   Compliance snapshot:   daily at 07:55 UTC
#   Compliance sweep:      daily at 08:00 UTC
#   Webhook retry:         every 5 minutes
#   Compliance digest:     Monday at 09:00 UTC
#   Audit retention:       Sunday at 02:00 UTC
#   Snapshot retention:    Sunday at 02:30 UTC
#
# USAGE:
#   nohup bash scripts/cron-runner.sh >> /tmp/urm-cron-runner.log 2>&1 &
#
# The script reads CRON_SECRET from ~/.urm-cron-secret (set by the admin).
# =============================================================================

set -uo pipefail

BASE_URL="http://localhost:3000"

# Load the cron secret
if [[ -f "$HOME/.urm-cron-secret" ]]; then
  CRON_SECRET="$(cat "$HOME/.urm-cron-secret")"
elif [[ -n "${CRON_SECRET:-}" ]]; then
  : # already set in env
else
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: CRON_SECRET not found. Set it in ~/.urm-cron-secret or as an env var."
  exit 1
fi

# Track which jobs have run today (so we don't re-run a daily job if the
# script restarts mid-day).
LAST_SNAPSHOT_DATE=""
LAST_SWEEP_DATE=""
LAST_DIGEST_WEEK=""
LAST_AUDIT_DATE=""
LAST_SNAPSHOT_RETENTION_DATE=""

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] cron-runner started"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] BASE_URL=$BASE_URL"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Secret loaded: ${#CRON_SECRET} chars"
echo ""

run_cron() {
  local endpoint="$1"
  local label="$2"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Running $label..."
  local response
  response=$(curl -s -X POST \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json" \
    --max-time 120 \
    "$BASE_URL/api/cron/$endpoint" 2>&1)
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $label response: $response"
  echo ""
}

while true; do
  NOW=$(date -u +"%Y-%m-%d %H:%M %u %W")
  TODAY=$(echo "$NOW" | cut -d' ' -f1)
  TIME=$(echo "$NOW" | cut -d' ' -f2)
  DOW=$(echo "$NOW" | cut -d' ' -f3)  # 1=Monday ... 7=Sunday
  WEEK=$(echo "$NOW" | cut -d' ' -f4)

  # --- Webhook retry: every 5 minutes ---
  # Fire at :00, :05, :10, :15, :20, :25, :30, :35, :40, :45, :50, :55
  if [[ "$TIME" == *":00" || "$TIME" == *":05" || "$TIME" == *":10" || "$TIME" == *":15" || "$TIME" == *":20" || "$TIME" == *":25" || "$TIME" == *":30" || "$TIME" == *":35" || "$TIME" == *":40" || "$TIME" == *":45" || "$TIME" == *":50" || "$TIME" == *":55" ]]; then
    run_cron "webhook-retry" "Webhook Retry"
  fi

  # --- Compliance snapshot: daily at 07:55 ---
  if [[ "$TIME" == "07:55" && "$LAST_SNAPSHOT_DATE" != "$TODAY" ]]; then
    LAST_SNAPSHOT_DATE="$TODAY"
    run_cron "compliance-snapshot" "Compliance Snapshot"
  fi

  # --- Compliance sweep: daily at 08:00 ---
  if [[ "$TIME" == "08:00" && "$LAST_SWEEP_DATE" != "$TODAY" ]]; then
    LAST_SWEEP_DATE="$TODAY"
    run_cron "compliance-sweep" "Compliance Sweep"
  fi

  # --- Compliance digest: Monday at 09:00 ---
  if [[ "$DOW" == "1" && "$TIME" == "09:00" && "$LAST_DIGEST_WEEK" != "$WEEK" ]]; then
    LAST_DIGEST_WEEK="$WEEK"
    run_cron "compliance-digest" "Compliance Digest"
  fi

  # --- Audit retention: Sunday at 02:00 ---
  if [[ "$DOW" == "7" && "$TIME" == "02:00" && "$LAST_AUDIT_DATE" != "$TODAY" ]]; then
    LAST_AUDIT_DATE="$TODAY"
    run_cron "audit-retention-sweep" "Audit Retention Sweep"
  fi

  # --- Snapshot retention: Sunday at 02:30 ---
  if [[ "$DOW" == "7" && "$TIME" == "02:30" && "$LAST_SNAPSHOT_RETENTION_DATE" != "$TODAY" ]]; then
    LAST_SNAPSHOT_RETENTION_DATE="$TODAY"
    run_cron "snapshot-retention-sweep" "Snapshot Retention Sweep"
  fi

  # Sleep for 60 seconds (checks every minute)
  sleep 60
done
