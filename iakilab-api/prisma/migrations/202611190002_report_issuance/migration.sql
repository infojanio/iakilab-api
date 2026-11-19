ALTER TABLE "Report"
ADD COLUMN "publicCode" TEXT,
ADD COLUMN "legacyPdfFilename" TEXT,
ADD COLUMN "issuanceAttempt" UUID,
ADD COLUMN "issuanceStartedAt" TIMESTAMP(3),
ADD COLUMN "issuanceFailedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Report_publicCode_key" ON "Report"("publicCode");
CREATE UNIQUE INDEX "Report_legacyPdfFilename_key" ON "Report"("legacyPdfFilename");
ALTER TABLE "Report" ADD CONSTRAINT "issuance_lease_consistent"
CHECK (("issuanceAttempt" IS NULL) = ("issuanceStartedAt" IS NULL));
