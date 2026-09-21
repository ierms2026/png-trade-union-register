// Test the document download endpoint with and without ?version= param.
// Run: npx tsx scripts/test-download-endpoint.ts

import { db } from "../src/lib/prisma";

async function main() {
  // Find a document with multiple versions
  const doc = await db.document.findFirst({
    where: { currentVersionId: { not: null } },
    include: {
      union: { select: { id: true, unionName: true } },
      versions: {
        orderBy: { versionNumber: "asc" },
        select: { id: true, versionNumber: true, filePath: true, fileName: true, fileExtension: true },
      },
    },
  });

  if (!doc) {
    console.log("No documents found in DB");
    return;
  }

  console.log("Found document:");
  console.log("  unionId:", doc.union.id);
  console.log("  unionName:", doc.union.unionName);
  console.log("  documentId:", doc.id);
  console.log("  documentType:", doc.documentType);
  console.log("  versions:", doc.versions.map(v => `v${v.versionNumber}(${v.fileName})`).join(", "));
  console.log("");
  console.log("Test URLs (use with curl -b cookies.txt):");
  console.log(`  Latest:  curl -b /tmp/cookies.txt -o /dev/null -w "%{http_code} %{size_download}\\n" http://localhost:3000/api/unions/${doc.union.id}/documents/${doc.id}/download`);
  if (doc.versions.length > 1) {
    console.log(`  v1:      curl -b /tmp/cookies.txt -o /dev/null -w "%{http_code} %{size_download}\\n" "http://localhost:3000/api/unions/${doc.union.id}/documents/${doc.id}/download?version=1"`);
  }
  console.log("");
  console.log("Expected: 200 + non-zero size for both");
}

main().catch(console.error).finally(() => db.$disconnect());
