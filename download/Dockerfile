# =============================================================================
# Dockerfile for QNAP TS-x31K deployment (ARM 32-bit: armv7l)
# =============================================================================
# Builds the Register of Trade Unions dashboard as a production server.
# Multi-stage build keeps the final image small.
#
# USAGE on QNAP Container Station:
#   1. Copy the dashboard-deploy tarball + this Dockerfile to a folder on QNAP
#   2. Build: docker build -t trade-unions-dashboard .
#   3. Run:   docker run -d -p 3000:3000 -v dashboard-data:/app/db --name dashboard trade-unions-dashboard
#   4. Open:  http://<qnap-ip>:3000/
#
# The /app/db volume persists the SQLite database across container restarts.
# =============================================================================

# Stage 1: Build (uses an x64 or ARM Node image depending on host arch)
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files + install deps
COPY package*.json ./
RUN npm ci || npm install

# Copy the rest of the source
COPY . .

# Set the SESSION_SECRET (required for production)
ENV SESSION_SECRET="qnap-deploy-secret-change-me-in-production-please-32-hex"

# Build the production server (this compiles for the host arch — ARM on TS-x31K)
RUN npm run build

# Stage 2: Runtime (smaller image)
FROM node:20-slim AS runner

WORKDIR /app

# Copy the standalone build + static + public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy prisma schema + the seed scripts (for one-time DB setup)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Create the db directory (SQLite file lives here)
RUN mkdir -p /app/db
ENV DATABASE_URL="file:/app/db/custom.db"
ENV SESSION_SECRET="qnap-deploy-secret-change-me-in-production-please-32-hex"
ENV NODE_ENV=production

EXPOSE 3000

# Default: start the server. The DB is auto-created by prisma db push (run once).
CMD ["node", "server.js"]
