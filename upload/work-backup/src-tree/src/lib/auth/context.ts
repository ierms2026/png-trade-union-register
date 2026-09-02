import { Role } from "@prisma/client";

// =============================================================================
// MOCK auth context — placeholder for the real auth-guard.
//
// The real implementation (Session 1 Step 5) will:
//   1. Read the session cookie from the request
//   2. Verify the HMAC signature (src/lib/auth/session.ts — already built)
//   3. Look up the Session row by JTI in the DB
//   4. Return the associated User (with role + assignedUnionId)
//
// WHY THIS MOCK EXISTS NOW:
// Session 2 needs to build and test the Officer silent-pin logic without
// waiting for Session 1 Step 5 (auth-guard) to ship. The mock returns a
// plausible AuthUser so routes can branch on role + assignedUnionId today.
//
// TESTABILITY:
// To exercise all three roles in one test run, we support two override
// mechanisms (BOTH forbidden in production — the constructor throws if
// NODE_ENV=production and either is used):
//
//   - X-Test-Role header    → overrides the role (REGISTRAR | INSPECTOR | OFFICER)
//   - X-Test-Union-Id header → overrides the OFFICER's assignedUnionId
//
// Without overrides, the mock defaults to:
//   - role: process.env.AUTH_DEFAULT_ROLE (default: REGISTRAR)
//   - assignedUnionId: process.env.AUTH_OFFICER_UNION_ID (default: null)
//
// The AuthUser shape matches what the real auth-guard will return, so
// swapping the mock for the real implementation later is a one-line change
// at the import site — no route code changes needed.
// =============================================================================

export interface AuthUser {
  /** User ID. In the mock, this is a stable "mock-id" string (or overridden
   *  via X-Test-User-Id for tests that need a real User row). The real
   *  auth-guard will return the actual User.id from the DB. Used as
   *  AuditLog.actorId and ApiKey.createdById. */
  id: string;
  name: string;
  email: string;
  role: Role;
  /** For OFFICER: the union they're scoped to. Null for REGISTRAR/INSPECTOR.
   *  Routes compare this to URL params to enforce scoping server-side. */
  assignedUnionId: string | null;
}

const VALID_ROLES: Role[] = ["REGISTRAR", "INSPECTOR", "OFFICER"];

function validateRole(value: string): Role {
  if (!VALID_ROLES.includes(value as Role)) {
    throw new Error(
      `Invalid role: '${value}'. Must be one of: ${VALID_ROLES.join(", ")}`,
    );
  }
  return value as Role;
}

/**
 * Returns the current authenticated user.
 *
 * MOCK IMPLEMENTATION — see file header for the real implementation plan.
 *
 * @param req Optional Request object — used to read X-Test-* headers for
 *            dev/test role override. The real auth-guard will require this
 *            (it needs to read the session cookie); the mock makes it
 *            optional so it can be called without a request for simple cases.
 */
export async function getAuthUser(req?: Request): Promise<AuthUser> {
  // --- Determine role ---------------------------------------------------------
  const headerRole = req?.headers.get("x-test-role");

  let role: Role;
  if (headerRole) {
    // Loud failure if the test header ever reaches production — we never
    // want a misconfigured prod environment to allow role spoofing.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "X-Test-Role header is forbidden in production. This header is " +
          "for dev/test only and must not ship.",
      );
    }
    role = validateRole(headerRole);
  } else {
    role = validateRole(process.env.AUTH_DEFAULT_ROLE || "REGISTRAR");
  }

  // --- Determine assignedUnionId (OFFICER only) ------------------------------
  let assignedUnionId: string | null = null;
  if (role === "OFFICER") {
    const headerUnionId = req?.headers.get("x-test-union-id");
    if (headerUnionId) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "X-Test-Union-Id header is forbidden in production.",
        );
      }
      assignedUnionId = headerUnionId;
    } else {
      assignedUnionId = process.env.AUTH_OFFICER_UNION_ID || null;
    }
  }

  // --- Build the mock user ----------------------------------------------------
  // Per Session 4 spec, getAuthUser() must return { role, id } so admin
  // routes can record actorId in AuditLog. The id is a stable mock value
  // ("mock-id") so it's deterministic across requests and identifiable in
  // the audit trail as mock data. The real auth-guard (Session 1 Step 5)
  // will replace this with the actual User.id from the DB.
  //
  // To support tests that need a real User row to exist (e.g. FK
  // constraints), the X-Test-User-Id header overrides the id. Forbidden
  // in production.
  const headerUserId = req?.headers.get("x-test-user-id");
  let userId: string;
  if (headerUserId) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("X-Test-User-Id header is forbidden in production.");
    }
    userId = headerUserId;
  } else {
    userId = "mock-id";
  }

  const user: AuthUser = {
    id: userId,
    name: `Mock ${role.charAt(0)}${role.slice(1).toLowerCase()}`,
    email: `mock-${role.toLowerCase()}@example.com`,
    role,
    assignedUnionId,
  };

  return user;
}
