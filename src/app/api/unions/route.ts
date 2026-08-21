import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { getAuthUserOrApiKey, hasScope } from "@/lib/auth/auth-guard";

// =============================================================================
// GET /api/unions
// -----------------------------------------------------------------------------
// Lists all unions (or just the Officer's assigned union). Each union
// includes its documents with their latest version.
//
// OFFICER SCOPING:
//   Officers see ONLY their assigned union. The query filters on
//   assignedUnionId server-side — the Officer can't see other unions
//   exist.
//
// RESPONSE SHAPE:
//   {
//     unions: [
//       {
//         id, unionName, registrationNo, fileNumber, status,
//         address, contactPerson, contactEmail, contactPhone, remarks,
//         createdAt, updatedAt,
//         documents: [
//           { id, documentType, currentVersionId, disposedAt, snoozedUntil,
//             latestVersion: { id, versionNumber, fileName, uploadedAt, fileSize } | null
//           },
//           ...
//         ]
//       },
//       ...
//     ]
//   }
// =============================================================================

export async function GET(req: NextRequest) {
  const user = await getAuthUserOrApiKey(req);
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  // API-key callers must have the `unions:read` scope. Session-cookie
  // callers bypass this — they inherit their role's full permissions.
  if (!hasScope(user, "unions:read")) {
    return NextResponse.json(
      { error: "Your API key does not have the 'unions:read' scope." },
      { status: 403 },
    );
  }

  // Officer scoping: only their assigned union.
   
  const where: any =
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
            take: 1, // just the latest version
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

  // Serialize dates + flatten the latest version.
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
      versions: undefined, // don't send the array — latestVersion is enough
    })),
  }));

  return NextResponse.json({ unions: serialized });
}
