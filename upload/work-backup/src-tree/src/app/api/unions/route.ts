import { NextRequest, NextResponse } from "next/server";
import { UnionStatus, Severity, Prisma } from "@prisma/client";
import { db } from "@/lib/prisma";
import { getAuthUserOrApiKey, hasScope, getAuthUser } from "@/lib/auth/auth-guard";

// =============================================================================
// GET /api/unions  |  POST /api/unions
// -----------------------------------------------------------------------------
// GET — lists all unions (or just the Officer's assigned union).
// POST — creates a new union (REGISTRAR only).
//
// AUTH MATRIX:
//   - REGISTRAR: GET all, POST to create new unions.
//   - INSPECTOR: GET all, no POST (read-only).
//   - OFFICER:   GET own union only, no POST.
//   - API key:   GET with `unions:read` scope, no POST.
//
// POST VALIDATION:
//   - unionName: required, non-empty
//   - registrationNo: required, unique (409 on duplicate)
//   - status: defaults to "ACTIVE"; must be a valid UnionStatus
//   - All other fields: optional, nullable
//
// POST creates an audit log entry (action: "union_create") + returns 201.
// The new union automatically appears on the public portal (the public
// endpoint reads live from the DB with no publish/approval step).
// =============================================================================

const VALID_STATUSES: UnionStatus[] = ["ACTIVE", "SUSPENDED", "DEREGISTERED"];

// -----------------------------------------------------------------------------
// GET — list unions (role-scoped)
// -----------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const user = await getAuthUserOrApiKey(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (!hasScope(user, "unions:read")) {
    return NextResponse.json(
      { error: "Your API key does not have the 'unions:read' scope." },
      { status: 403 },
    );
  }

  const where: Record<string, unknown> =
    user.role === "OFFICER" && user.assignedUnionId
      ? { id: user.assignedUnionId }
      : {};

  const unions = await db.union.findMany({
    where,
    orderBy: { unionName: "asc" },
    include: {
      documents: {
        orderBy: { documentType: "asc" },
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: {
              id: true,
              versionNumber: true,
              fileName: true,
              uploadedAt: true,
              fileSize: true,
              fileExtension: true,
            },
          },
        },
      },
    },
  });

  const serialized = unions.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    documents: u.documents.map((d) => ({
      ...d,
      disposedAt: d.disposedAt?.toISOString() ?? null,
      snoozedUntil: d.snoozedUntil?.toISOString() ?? null,
      latestVersion: d.versions[0]
        ? {
            ...d.versions[0],
            uploadedAt: d.versions[0].uploadedAt.toISOString(),
          }
        : null,
      versions: undefined,
    })),
  }));

  return NextResponse.json({ unions: serialized });
}

// -----------------------------------------------------------------------------
// POST — create a new union (REGISTRAR only)
// -----------------------------------------------------------------------------

interface CreateUnionBody {
  unionName?: unknown;
  registrationNo?: unknown;
  fileNumber?: unknown;
  status?: unknown;
  address?: unknown;
  contactPerson?: unknown;
  contactEmail?: unknown;
  contactPhone?: unknown;
  remarks?: unknown;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  // Only Registrars can create new unions.
  if (user.role !== "REGISTRAR") {
    return NextResponse.json(
      { error: "Only Registrars can register new unions." },
      { status: 403 },
    );
  }

  let body: CreateUnionBody;
  try {
    body = (await req.json()) as CreateUnionBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  // --- Validate required fields ---
  if (typeof body.unionName !== "string" || body.unionName.trim().length === 0) {
    return NextResponse.json(
      { error: "Field 'unionName' is required." },
      { status: 400 },
    );
  }
  if (typeof body.registrationNo !== "string" || body.registrationNo.trim().length === 0) {
    return NextResponse.json(
      { error: "Field 'registrationNo' is required." },
      { status: 400 },
    );
  }

  // --- Check registration number uniqueness ---
  const existing = await db.union.findUnique({
    where: { registrationNo: body.registrationNo.trim() },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: `A union with registration number "${body.registrationNo.trim()}" already exists.` },
      { status: 409 },
    );
  }

  // --- Validate status (if provided) ---
  let status: UnionStatus = "ACTIVE";
  if (body.status !== undefined && body.status !== null) {
    if (typeof body.status !== "string" || !VALID_STATUSES.includes(body.status as UnionStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}.` },
        { status: 400 },
      );
    }
    status = body.status as UnionStatus;
  }

  // --- Build the create data ---
  // Helper: optional string fields become null if empty/missing, else trimmed.
  const opt = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

  const data: Prisma.UnionUncheckedCreateInput = {
    unionName: body.unionName.trim(),
    registrationNo: body.registrationNo.trim(),
    status,
    fileNumber: opt(body.fileNumber),
    address: opt(body.address),
    contactPerson: opt(body.contactPerson),
    contactEmail: opt(body.contactEmail),
    contactPhone: opt(body.contactPhone),
    remarks: opt(body.remarks),
  };

  // --- Create the union ---
  const union = await db.union.create({ data });

  // --- Audit log ---
  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: "union_create",
      entityType: "Union",
      entityId: union.id,
      afterJson: JSON.stringify({
        unionName: union.unionName,
        registrationNo: union.registrationNo,
        status: union.status,
        fileNumber: union.fileNumber,
      }),
      severity: Severity.INFO,
    },
  });

  // --- Return the created union (serialized) ---
  const serialized = {
    ...union,
    createdAt: union.createdAt.toISOString(),
    updatedAt: union.updatedAt.toISOString(),
  };

  return NextResponse.json({ union: serialized }, { status: 201 });
}
