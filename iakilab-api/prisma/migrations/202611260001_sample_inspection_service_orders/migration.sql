CREATE TYPE "InspectionDecision" AS ENUM ('ACCEPTED', 'ACCEPTED_WITH_RESERVATION', 'REJECTED');

CREATE TABLE "ServiceOrder" (
    "id" UUID NOT NULL,
    "laboratoryId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitCompletedAt" TIMESTAMP(3),
    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ServiceOrder_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ServiceOrder_laboratoryId_id_key" ON "ServiceOrder"("laboratoryId", "id");
CREATE UNIQUE INDEX "ServiceOrder_laboratoryId_number_key" ON "ServiceOrder"("laboratoryId", "number");

ALTER TABLE "Sample"
    ADD COLUMN "serviceOrderId" UUID,
    ADD COLUMN "inspectionDecision" "InspectionDecision",
    ADD COLUMN "receivedAt" TIMESTAMP(3),
    ADD COLUMN "receivedById" UUID,
    ADD COLUMN "receivedByName" TEXT,
    ADD COLUMN "arrivalCondition" TEXT,
    ADD COLUMN "inspectionReason" TEXT,
    ADD COLUMN "analysisStartedAt" TIMESTAMP(3),
    ADD COLUMN "analysisResult" TEXT,
    ADD CONSTRAINT "Sample_laboratoryId_serviceOrderId_fkey" FOREIGN KEY ("laboratoryId", "serviceOrderId") REFERENCES "ServiceOrder"("laboratoryId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Sample_inspection_consistency_check" CHECK (
      ("inspectionDecision" IS NULL AND "receivedAt" IS NULL AND "receivedById" IS NULL AND "receivedByName" IS NULL AND "arrivalCondition" IS NULL AND "inspectionReason" IS NULL)
      OR ("inspectionDecision" IS NOT NULL AND "receivedAt" IS NOT NULL AND "receivedById" IS NOT NULL AND "receivedByName" IS NOT NULL AND COALESCE(length(btrim("arrivalCondition")), 0) > 0 AND
          ("inspectionDecision" = 'ACCEPTED' OR COALESCE(length(btrim("inspectionReason")), 0) > 0))
    ),
    ADD CONSTRAINT "Sample_analysis_inspection_check" CHECK (
      ("analysisStartedAt" IS NULL AND "analysisResult" IS NULL)
      OR ("analysisStartedAt" IS NOT NULL AND "inspectionDecision" IS NOT NULL AND "inspectionDecision" IN ('ACCEPTED', 'ACCEPTED_WITH_RESERVATION'))
    );
CREATE INDEX "Sample_laboratoryId_serviceOrderId_idx" ON "Sample"("laboratoryId", "serviceOrderId");

ALTER TABLE "Report"
    ADD COLUMN "serviceOrderId" UUID,
    ADD CONSTRAINT "Report_laboratoryId_serviceOrderId_fkey" FOREIGN KEY ("laboratoryId", "serviceOrderId") REFERENCES "ServiceOrder"("laboratoryId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Report_laboratoryId_serviceOrderId_idx" ON "Report"("laboratoryId", "serviceOrderId");
