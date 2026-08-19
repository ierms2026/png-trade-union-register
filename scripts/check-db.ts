import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
async function main() {
  console.log("Users:", await db.user.count())
  console.log("Unions:", await db.union.count())
  console.log("Documents:", await db.document.count())
  console.log("ComplianceRules:", await db.complianceRule.count())
  console.log("Tasks:", await db.task.count())
  console.log("Notifications:", await db.notification.count())
  console.log("Sessions:", await db.session.count())
}
main().catch(console.error).finally(() => db.$disconnect())
