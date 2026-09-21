export const runtime = "nodejs"; // Required: uses Node.js modules (node:fs, node:path, etc.)
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { db } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/auth-guard";
import { Role, Severity } from "@prisma/client";

// =============================================================================
// GET /api/api-keys   |   POST /api/api-keys
// -----------------------------------------------------------------------------
// REGISTRAR-only. API keys enable programmatic access (scripts, integrations)
// without a browser session.
//
// KEY GENERATION DESIGN:
//   1. Generate 32 random bytes (256 bits of entropy) — unguessable.
//   2. Hex-encode → 64-char string.
//   3. Prepend the "urm_" prefix → "urm_" + 64 chars = 68-char key.
//   4. The prefix exposed in the UI is the FIRST 12 chars of the FULL key,
//      which means "urm_" + the first 8 chars of the random hex.
//      That's enough to identify the key visually ("urm_a1b2c3d4...")
//      without leaking the rest.
//   5. SHA-256 hash the FULL key → 64-char hex digest. Persist this hash
//      (not the key) + the prefix. The hash is one-way — even if the DB
//      leaks, attackers can't recover the original key.
//
// "FULL KEY RETURNED EXACTLY ONCE":
//   The create response includes the full key string. The client MUST
//   copy it — subsequent GET requests return only the prefix. If the
//   client loses the key, they must revoke and reissue. There is NO way
//   to recover the full key from the server after creation (it's never
//   persisted, only its SHA-256 hash is).
//
// SCOPES:
//   Comma-separated string, e.g. "unions:read,documents:read". The
//   business context restricts API keys to a fixed set of permissions:
//   unions/documents/compliance/audit. Deliberately NO users:* or
//   api-keys:* scope — admin actions require a browser session, not a
//   programmable key (defense in depth against key theft).
//   We validate against a whitelist at creation time.
//
// EXPIRY:
//   Max 365 days from creation. Forced expiry limits the blast radius of
//   a stolen key — even if never detected, the key stops working within
//   a year. The caller can set a shorter expiry; the API enforces the max.
// =============================================================================

// The API key prefix — matches the Session 1 cookie name (`urm_session`)
// for brand consistency. Both are auth tokens issued by the Union Records
// Management system.
const API_KEY_PREFIX = "urm_";

// Length of the random portion of the key (in bytes, before hex encoding).
// 32 bytes = 256 bits of entropy — exceeds NIST SP 800-107's recommendation
// of 128 bits for symmetric keys.
const API_KEY_RANDOM_BYTES = 32;

// The number of characters to expose as the "prefix" in the UI.
// 12 chars = "urm_" (4) + 8 random hex chars. Enough to visually identify
// the key without leaking more than 1/8 of the random portion.
const API_KEY_PREFIX_LENGTH = 12;

// Maximum allowed expiry: 365 days from creation. Per spec.
const MAX_EXPIRY_DAYS = 365;

// Allowed scopes (whitelist). Per spec: unions/documents/compliance/audit.
// Deliberately NO users:* or api-keys:* — admin actions require a browser
// session, not a programmable key.
const ALLOWED_SCOPES = new Set([
  "unions:read",
  "unions:write",
  "documents:read",
  "documents:write",
  "compliance:read",
  "audit:read",
]);

// Public fields for the GET response — strip keyHash always.
// Note: we expose the `prefix` (first 12 chars) so the UI can render
// "urm_a1b2c3d4..." — but NEVER the full key.
const API_KEY_PUBLIC_FIELDS = {
  id: true,
  name: true,
  prefix: true,
  scopes: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  // DELIBERATELY EXCLUDED:
  // - keyHash (one-way hash; would be useless to client + is a secret)
  // - createdById (exposed via the `creator` relation if needed in UI)
} as const;

// -----------------------------------------------------------------------------
// GET — list all API keys (active + revoked)
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (user.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can view API keys." },
      { status: 403 },
    );
  }

  // Returns ALL keys, including revoked ones. Revoked keys have revokedAt
  // set but stay in the list (soft-delete for audit history) — the UI
  // shows them with a "Revoked" badge.
  const apiKeys = await db.apiKey.findMany({
    select: API_KEY_PUBLIC_FIELDS,
    orderBy: { createdAt: "desc" }, // newest first
  });

  return NextResponse.json({ apiKeys });
}

// -----------------------------------------------------------------------------
// POST — create a new API key
// -----------------------------------------------------------------------------

interface CreateRequestBody {
  name?: unknown;
  scopes?: unknown;
  expiresAt?: unknown;
}

export async function POST(req: NextRequest) {
  // --- 1. Auth check -------------------------------------------------------
  const actor = await getAuthUser(req);
  if (!actor) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (actor.role !== Role.REGISTRAR) {
    return NextResponse.json(
      { error: "Only Registrars can create API keys." },
      { status: 403 },
    );
  }

  // --- 2. Parse + validate the body ---------------------------------------
  let body: CreateRequestBody;
  try {
    body = (await req.json()) as CreateRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  // name — required, non-empty string
  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json(
      { error: "Field 'name' is required and must be a non-empty string." },
      { status: 400 },
    );
  }

  // scopes — required, must be a non-empty array of valid scope strings
  // The caller sends an array; we join to comma-separated string for storage
  if (!Array.isArray(body.scopes) || body.scopes.length === 0) {
    return NextResponse.json(
      { error: "Field 'scopes' is required and must be a non-empty array." },
      { status: 400 },
    );
  }

  const invalidScopes = (body.scopes as unknown[]).filter(
    (s) => typeof s !== "string" || !ALLOWED_SCOPES.has(s as string),
  );
  if (invalidScopes.length > 0) {
    return NextResponse.json(
      {
        error: `Invalid scopes: ${invalidScopes.join(", ")}. Allowed: ${Array.from(ALLOWED_SCOPES).join(", ")}.`,
      },
      { status: 400 },
    );
  }

  // expiresAt — required, must be a future ISO date, max 365 days from now
  if (typeof body.expiresAt !== "string" || body.expiresAt.trim().length === 0) {
    return NextResponse.json(
      { error: "Field 'expiresAt' is required and must be an ISO date string." },
      { status: 400 },
    );
  }

  const expiresAt = new Date(body.expiresAt);
  if (isNaN(expiresAt.getTime())) {
    return NextResponse.json(
      { error: "Field 'expiresAt' must be a valid ISO date string." },
      { status: 400 },
    );
  }

  const now = new Date();
  if (expiresAt.getTime() <= now.getTime()) {
    return NextResponse.json(
      { error: "Field 'expiresAt' must be a future date." },
      { status: 400 },
    );
  }

  const maxExpiry = new Date(now.getTime() + MAX_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  if (expiresAt.getTime() > maxExpiry.getTime()) {
    return NextResponse.json(
      {
        error: `Field 'expiresAt' must not exceed ${MAX_EXPIRY_DAYS} days from creation.`,
      },
      { status: 400 },
    );
  }

  // --- 3. Generate the API key ---------------------------------------------
  // Format: "urm_" + 64 hex chars (from 32 random bytes) = 68-char total
  const randomHex = randomBytes(API_KEY_RANDOM_BYTES).toString("hex");
  const fullKey = `${API_KEY_PREFIX}${randomHex}`;

  // SHA-256 hash of the full key — persisted, never reversibly stored
  const keyHash = createHash("sha256").update(fullKey).digest("hex");

  // First 12 chars of the full key — exposed in the UI ("urm_a1b2c3d4...")
  const prefix = fullKey.slice(0, API_KEY_PREFIX_LENGTH);

  // --- 4. Persist the key (hash + prefix only — NEVER the full key) -------
  // createdById is the actor's id — used for the `creator` relation.
  // The `actor.id` from the mock is "mock-id" by default; real auth-guard
  // (Session 1 Step 5) will return the actual User.id.
  const newApiKey = await db.apiKey.create({
    data: {
      name: body.name.trim(),
      prefix,
      keyHash,
      scopes: (body.scopes as string[]).join(","),
      expiresAt,
      createdById: actor.id,
    },
    select: API_KEY_PUBLIC_FIELDS,
  });

  // --- 5. Audit log entry -------------------------------------------------
  // Note: we do NOT log the full key OR the keyHash in the audit trail.
  // The audit entry just records "an API key was created with these
  // scopes and expiry" — proving the action happened without leaking
  // the secret.
  await db.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      action: "api_key_create",
      entityType: "ApiKey",
      entityId: newApiKey.id,
      beforeJson: null, // create action
      afterJson: JSON.stringify({
        name: newApiKey.name,
        prefix: newApiKey.prefix,
        scopes: newApiKey.scopes,
        expiresAt: newApiKey.expiresAt,
        // DELIBERATELY EXCLUDED:
        // - keyHash (one-way hash, but still a secret — never log it)
        // - the full key (only returned in the API response, never persisted)
      }),
      severity: Severity.INFO,
    },
  });

  // --- 6. Return the new key + the FULL key string (ONE TIME) -------------
  // The full key is included here and ONLY here — subsequent GET requests
  // return only the prefix. The client MUST copy the key now.
  return NextResponse.json(
    {
      apiKey: newApiKey,
      // The full key string. Display this ONCE to the user and never again.
      // In the UI, this is shown in a one-time dialog with a "Copy" button
      // and a warning: "You won't be able to see this again."
      key: fullKey,
    },
    { status: 201 },
  );
}
