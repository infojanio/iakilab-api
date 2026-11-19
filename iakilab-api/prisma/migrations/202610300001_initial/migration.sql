-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('USER', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "LaboratoryRole" AS ENUM ('ADMIN', 'ANALISTA');

-- CreateEnum
CREATE TYPE "ReportKind" AS ENUM ('WATER', 'SOIL', 'PDF_UPLOAD');

-- CreateEnum
CREATE TYPE "ReportStage" AS ENUM ('DRAFT', 'AWAITING_VALIDATION', 'VALIDATED', 'ISSUED');

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'FAILED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('ORIGINAL', 'ISSUED', 'SIGNED');

-- CreateTable
CREATE TABLE "Laboratory" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Laboratory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "globalRole" "GlobalRole" NOT NULL DEFAULT 'USER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaboratoryMembership" (
    "laboratoryId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "LaboratoryRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LaboratoryMembership_pkey" PRIMARY KEY ("laboratoryId","userId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "laboratoryId" UUID,
    "currentRefreshHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshUse" (
    "hash" TEXT NOT NULL,
    "sessionId" UUID NOT NULL,

    CONSTRAINT "RefreshUse_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "laboratoryId" UUID NOT NULL,
    "identification" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "kind" "ReportKind" NOT NULL,
    "stage" "ReportStage" NOT NULL DEFAULT 'DRAFT',
    "draftData" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "legacyPublicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportVersion" (
    "id" UUID NOT NULL,
    "laboratoryId" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "validatedAt" TIMESTAMP(3),
    "validatedBy" UUID,
    "issuedAt" TIMESTAMP(3),
    "issuedBy" UUID,
    "signatureStatus" "SignatureStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "signatureVerifiedAt" TIMESTAMP(3),
    "signedSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportFile" (
    "id" UUID NOT NULL,
    "laboratoryId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "kind" "FileKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "maxUsers" INTEGER NOT NULL,
    "maxReports" INTEGER NOT NULL,
    "storageBytes" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "laboratoryId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Laboratory_slug_key" ON "Laboratory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Laboratory_document_key" ON "Laboratory"("document");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "LaboratoryMembership_userId_active_idx" ON "LaboratoryMembership"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Session_currentRefreshHash_key" ON "Session"("currentRefreshHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_legacyPublicId_key" ON "Report"("legacyPublicId");

-- CreateIndex
CREATE INDEX "Report_laboratoryId_createdAt_id_idx" ON "Report"("laboratoryId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Report_laboratoryId_stage_idx" ON "Report"("laboratoryId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Report_laboratoryId_id_key" ON "Report"("laboratoryId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Report_laboratoryId_identification_key" ON "Report"("laboratoryId", "identification");

-- CreateIndex
CREATE UNIQUE INDEX "ReportVersion_laboratoryId_id_key" ON "ReportVersion"("laboratoryId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ReportVersion_laboratoryId_reportId_number_key" ON "ReportVersion"("laboratoryId", "reportId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ReportFile_storageKey_key" ON "ReportFile"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReportFile_laboratoryId_versionId_kind_key" ON "ReportFile"("laboratoryId", "versionId", "kind");

-- CreateIndex
CREATE INDEX "Subscription_laboratoryId_expiresAt_idx" ON "Subscription"("laboratoryId", "expiresAt");

-- AddForeignKey
ALTER TABLE "LaboratoryMembership" ADD CONSTRAINT "LaboratoryMembership_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaboratoryMembership" ADD CONSTRAINT "LaboratoryMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshUse" ADD CONSTRAINT "RefreshUse_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportVersion" ADD CONSTRAINT "ReportVersion_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportVersion" ADD CONSTRAINT "ReportVersion_laboratoryId_reportId_fkey" FOREIGN KEY ("laboratoryId", "reportId") REFERENCES "Report"("laboratoryId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportFile" ADD CONSTRAINT "ReportFile_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportFile" ADD CONSTRAINT "ReportFile_laboratoryId_versionId_fkey" FOREIGN KEY ("laboratoryId", "versionId") REFERENCES "ReportVersion"("laboratoryId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Evidence constraints; file hash correspondence is also checked before serving.
ALTER TABLE "ReportVersion" ADD CONSTRAINT "verified_signature_requires_evidence" CHECK ("signatureStatus" <> 'VERIFIED' OR ("signatureVerifiedAt" IS NOT NULL AND "signedSha256" ~ '^[0-9a-f]{64}$' AND "issuedAt" IS NOT NULL));
ALTER TABLE "ReportFile" ADD CONSTRAINT "file_integrity_metadata" CHECK ("sha256" ~ '^[0-9a-f]{64}$' AND "byteLength" > 0 AND "byteLength" <= 20971520);
ALTER TABLE "Report" ADD CONSTRAINT "positive_report_revision" CHECK ("revision" > 0);
ALTER TABLE "ReportVersion" ADD CONSTRAINT "positive_version_number" CHECK ("number" > 0);
