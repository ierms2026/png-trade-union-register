-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('REGISTRAR', 'INSPECTOR', 'OFFICER');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "UnionStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEREGISTERED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DispositionStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'EXECUTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ContactUpdateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('COMPLIANCE', 'TASK');

-- CreateEnum
CREATE TYPE "WebhookEventType" AS ENUM ('COMPLIANCE_STATUS_CHANGE', 'DOCUMENT_UPLOADED', 'DOCUMENT_REVIEWED', 'CONTACT_UPDATE_SUBMITTED', 'CONTACT_UPDATE_REVIEWED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "assignedUnionId" TEXT,
    "twoFactorSecret" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "phone" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "smsNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "userId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "severity" "Severity" NOT NULL DEFAULT 'INFO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceRule" (
    "id" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "renewalYears" INTEGER NOT NULL DEFAULT 1,
    "retentionYrs" INTEGER NOT NULL DEFAULT 7,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Union" (
    "id" TEXT NOT NULL,
    "unionName" TEXT NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "fileNumber" TEXT,
    "status" "UnionStatus" NOT NULL DEFAULT 'ACTIVE',
    "address" TEXT,
    "contactPerson" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Union_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "unionId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "disposedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "firstApprovedById" TEXT,
    "firstApprovedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "archivedReason" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "fileExtension" TEXT,
    "textContent" TEXT,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveDate" TIMESTAMP(3),
    "supersedesVersionId" TEXT,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "dueDate" TIMESTAMP(3),
    "unionId" TEXT,
    "assigneeId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "linkUrl" TEXT,
    "readAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "emailError" TEXT,
    "smsSentAt" TIMESTAMP(3),
    "smsError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalHold" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "placedById" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),
    "liftedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispositionRequest" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "DispositionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cooldownEndsAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "executedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "certificateJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispositionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceSnapshot" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "compliant" INTEGER NOT NULL,
    "expiring" INTEGER NOT NULL,
    "overdue" INTEGER NOT NULL,
    "awaitingReview" INTEGER NOT NULL DEFAULT 0,
    "missing" INTEGER NOT NULL,
    "rateNumerator" INTEGER NOT NULL,
    "rateDenominator" INTEGER NOT NULL,
    "capturedWith" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactUpdateRequest" (
    "id" TEXT NOT NULL,
    "unionId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "address" TEXT,
    "contactPerson" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "status" "ContactUpdateStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactUpdateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "events" TEXT NOT NULL DEFAULT '',
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" "WebhookEventType" NOT NULL,
    "payload" TEXT NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastResponseCode" INTEGER,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "firstAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "Session_jti_key" ON "Session"("jti");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceRule_documentType_key" ON "ComplianceRule"("documentType");

-- CreateIndex
CREATE UNIQUE INDEX "Union_registrationNo_key" ON "Union"("registrationNo");

-- CreateIndex
CREATE UNIQUE INDEX "Document_unionId_documentType_key" ON "Document"("unionId", "documentType");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupKey_key" ON "Notification"("dedupKey");

-- CreateIndex
CREATE INDEX "LegalHold_documentId_liftedAt_idx" ON "LegalHold"("documentId", "liftedAt");

-- CreateIndex
CREATE INDEX "DispositionRequest_documentId_status_idx" ON "DispositionRequest"("documentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceSnapshot_date_key" ON "ComplianceSnapshot"("date");

-- CreateIndex
CREATE INDEX "ContactUpdateRequest_unionId_status_idx" ON "ContactUpdateRequest"("unionId", "status");

-- CreateIndex
CREATE INDEX "ContactUpdateRequest_status_idx" ON "ContactUpdateRequest"("status");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_active_idx" ON "WebhookEndpoint"("active");

-- CreateIndex
CREATE INDEX "WebhookDelivery_endpointId_status_idx" ON "WebhookDelivery"("endpointId", "status");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextRetryAt_idx" ON "WebhookDelivery"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_eventType_idx" ON "WebhookDelivery"("eventType");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginAttempt" ADD CONSTRAINT "LoginAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_unionId_fkey" FOREIGN KEY ("unionId") REFERENCES "Union"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_firstApprovedById_fkey" FOREIGN KEY ("firstApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_supersedesVersionId_fkey" FOREIGN KEY ("supersedesVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_unionId_fkey" FOREIGN KEY ("unionId") REFERENCES "Union"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_placedById_fkey" FOREIGN KEY ("placedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalHold" ADD CONSTRAINT "LegalHold_liftedById_fkey" FOREIGN KEY ("liftedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispositionRequest" ADD CONSTRAINT "DispositionRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispositionRequest" ADD CONSTRAINT "DispositionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispositionRequest" ADD CONSTRAINT "DispositionRequest_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispositionRequest" ADD CONSTRAINT "DispositionRequest_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactUpdateRequest" ADD CONSTRAINT "ContactUpdateRequest_unionId_fkey" FOREIGN KEY ("unionId") REFERENCES "Union"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactUpdateRequest" ADD CONSTRAINT "ContactUpdateRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactUpdateRequest" ADD CONSTRAINT "ContactUpdateRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Demo users (password: Test!2345abc)
INSERT INTO "User" ("id", "email", "passwordHash", "role", "twoFactorEnabled", "failedLoginAttempts", "disabled", "emailNotificationsEnabled", "smsNotificationsEnabled", "whatsappNotificationsEnabled") VALUES (gen_random_uuid(), 'registrar@example.com', '$2b$12$7NMX6S3zlGPPAhUQC0ebk.k.32pGAbhKIF.Hd8bW1otwXXBJnmqsm', 'REGISTRAR', false, 0, false, true, false, false);
INSERT INTO "User" ("id", "email", "passwordHash", "role", "twoFactorEnabled", "failedLoginAttempts", "disabled", "emailNotificationsEnabled", "smsNotificationsEnabled", "whatsappNotificationsEnabled") VALUES (gen_random_uuid(), 'inspector@example.com', '$2b$12$7NMX6S3zlGPPAhUQC0ebk.k.32pGAbhKIF.Hd8bW1otwXXBJnmqsm', 'INSPECTOR', false, 0, false, true, false, false);
INSERT INTO "User" ("id", "email", "passwordHash", "role", "twoFactorEnabled", "failedLoginAttempts", "disabled", "emailNotificationsEnabled", "smsNotificationsEnabled", "whatsappNotificationsEnabled") VALUES (gen_random_uuid(), 'officer@example.com', '$2b$12$7NMX6S3zlGPPAhUQC0ebk.k.32pGAbhKIF.Hd8bW1otwXXBJnmqsm', 'OFFICER', false, 0, false, true, false, false);

-- Demo unions
INSERT INTO "Union" ("id", "unionName", "registrationNo", "status", "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'East Sepik Fisherfolk Cooperative', 'IO-05', 'DEREGISTERED', NOW(), NOW());
INSERT INTO "Union" ("id", "unionName", "registrationNo", "status", "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'Highlands Coffee Growers Association', 'IO-02', 'ACTIVE', NOW(), NOW());
INSERT INTO "Union" ("id", "unionName", "registrationNo", "status", "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'New Ireland Mining Employees Union', 'IO-04', 'ACTIVE', NOW(), NOW());
INSERT INTO "Union" ("id", "unionName", "registrationNo", "status", "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'Papua Maritime Workers Union', 'IO-01', 'ACTIVE', NOW(), NOW());
INSERT INTO "Union" ("id", "unionName", "registrationNo", "status", "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'Port Moresby Teachers Federation', 'IO-03', 'SUSPENDED', NOW(), NOW());
INSERT INTO "Union" ("id", "unionName", "registrationNo", "status", "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'Southern Highlands Energy Workers Union', 'IO-06', 'ACTIVE', NOW(), NOW());

-- Compliance rules (7 document types with default settings)
INSERT INTO "ComplianceRule" ("id", "documentType", "required", "renewalYears", "retentionYrs", "sensitive", "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'Registration Certificate', true, 1, 7, false, NOW(), NOW());
INSERT INTO "ComplianceRule" ("id", "documentType", "required", "renewalYears", "retentionYrs", "sensitive", "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'Constitution', true, 5, 7, false, NOW(), NOW());
INSERT INTO "ComplianceRule" ("id", "documentType", "required", "renewalYears", "retentionYrs", "sensitive", "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'Financial Return', true, 1, 7, true, NOW(), NOW());
INSERT INTO "ComplianceRule" ("id", "documentType", "required", "renewalYears", "retentionYrs", "sensitive", "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'Election of Office Bearers', true, 3, 7, false, NOW(), NOW());
INSERT INTO "ComplianceRule" ("id", "documentType", "required", "renewalYears", "retentionYrs", "sensitive", "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'Financial Membership List', true, 1, 7, true, NOW(), NOW());
INSERT INTO "ComplianceRule" ("id", "documentType", "required", "renewalYears", "retentionYrs", "sensitive", "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'Awards', false, 1, 7, false, NOW(), NOW());
INSERT INTO "ComplianceRule" ("id", "documentType", "required", "renewalYears", "retentionYrs", "sensitive", "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'Affiliations', false, 1, 7, false, NOW(), NOW());

-- Link the officer to Papua Maritime Workers Union
UPDATE "User" SET "assignedUnionId" = (SELECT "id" FROM "Union" WHERE "registrationNo" = 'IO-01') WHERE "email" = 'officer@example.com';
