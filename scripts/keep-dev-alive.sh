#!/usr/bin/env bash
# =============================================================================
# keep-dev-alive.sh — watchdog for the Next.js dev server.
# Restarts `npm run dev` if the next-server process dies.
#
# The dev environment has been unstable this session (next-server dies
# after the initial compile, possibly due to platform resource limits
# when an external browser connects). This watchdog polls every 5s +
# restarts the server if it's gone.
#
# Run in the background: nohup bash scripts/keep-dev-alive.sh &
# =============================================================================

set -uo pipefail

LOG=/tmp/dev-watchdog.log
DEV_LOG=dev.log

echo "[watchdog $(date -u +%H:%M:%S)] starting" >> "$LOG"

while true; do
  if ! ps -ef | grep -E "next-server \(v" | grep -v grep > /dev/null; then
    echo "[watchdog $(date -u +%H:%M:%S)] next-server DEAD — restarting..." >> "$LOG"
    pkill -f "next-server" 2>/dev/null
    pkill -f "next dev" 2>/dev/null
    sleep 2
    rm -f "$DEV_LOG"
    nohup npm run dev > /tmp/dev-start.log 2>&1 & disown
    # Wait for ready
    for i in $(seq 1 30); do
      sleep 2
      if grep -q "Ready in" "$DEV_LOG" 2>/dev/null; then
        echo "[watchdog $(date -u +%H:%M:%S)] server ready at $((i*2))s — warming..." >> "$LOG"
        # Warm the compile
        curl -s -o /dev/null --max-time 180 http://localhost:3000/ 2>&1
        sleep 2
        code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3000/ 2>&1)
        echo "[watchdog $(date -u +%H:%M:%S)] warm-up HTTP $code" >> "$LOG"
        break
      fi
    done
  fi
  sleep 5
done
