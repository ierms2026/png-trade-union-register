# =============================================================================
# Dockerfile for QNAP TS-x31K (ARM 32-bit, 1GB RAM)
# =============================================================================
# PRE-BUILT: this image does NOT run `npm run build` — it uses the pre-built
# standalone output from .next/standalone/. This avoids the 1.5-2GB RAM spike
# that would OOM the TS-x31K during build.
#
# The only native-binary step is `prisma generate` on first boot, which
# fetches the ARM query engine (~15MB) — well within the 1GB budget.
#
# USAGE:
#   docker build -t trade-unions-dashboard .
#   docker run -d -p 3000:3000 -v dashboard-db:/app/db --name dashboard --restart unless-stopped trade-unions-dashboard
#
# The /app/db volume persists the SQLite database across container restarts.
# The --restart unless-stopped policy auto-starts the container on QNAP boot.
# =============================================================================

FROM node:20-slim

WORKDIR /app

# Copy the pre-built standalone output + static + public
COPY app/ ./

# Install only the prisma CLI (needed for `prisma generate` on first boot)
# + tsx (for running the seed scripts)
RUN npm install --no-save prisma@6 tsx@4 2>&1 | tail -3

# Generate the Prisma client for THIS container's architecture (ARM on TS-x31K)
# This fetches the ARM query engine (~15MB) during the Docker image build.
RUN npx prisma generate

# Create the DB directory (SQLite file lives here, mounted as a volume)
RUN mkdir -p /app/db

# Environment
ENV DATABASE_URL="file:/app/db/custom.db"
ENV NODE_ENV=production
ENV PORT=3000
# SESSION_SECRET is set via docker-compose.yml (or docker run -e)

EXPOSE 3000

# Startup script: push schema → seed → reset passwords → start server
# The seed + reset are idempotent (safe to run on every boot).
COPY startup.sh ./
RUN chmod +x startup.sh

CMD ["./startup.sh"]
