ALTER TABLE "Report"
    ADD COLUMN "rectifiesId" UUID,
    ADD COLUMN "rectificationRootId" UUID,
    ADD COLUMN "rectificationNumber" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "rectificationReason" TEXT,
    ADD COLUMN "rectificationActorId" UUID,
    ADD COLUMN "rectificationActorName" TEXT,
    ADD CONSTRAINT "Report_laboratoryId_rectifiesId_fkey" FOREIGN KEY ("laboratoryId", "rectifiesId") REFERENCES "Report"("laboratoryId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Report_laboratoryId_rectificationRootId_fkey" FOREIGN KEY ("laboratoryId", "rectificationRootId") REFERENCES "Report"("laboratoryId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "Report_rectification_consistency_check" CHECK (
        ("rectificationNumber" = 0 AND "rectifiesId" IS NULL AND "rectificationRootId" IS NULL AND "rectificationReason" IS NULL AND "rectificationActorId" IS NULL AND "rectificationActorName" IS NULL)
        OR ("rectificationNumber" > 0 AND "rectifiesId" IS NOT NULL AND "rectificationRootId" IS NOT NULL AND "rectifiesId" <> "id" AND "rectificationRootId" <> "id" AND COALESCE(length(btrim("rectificationReason")), 0) > 0 AND "rectificationActorId" IS NOT NULL AND "rectificationActorName" IS NOT NULL)
    );
CREATE UNIQUE INDEX "Report_laboratoryId_rectifiesId_key" ON "Report"("laboratoryId", "rectifiesId");
CREATE UNIQUE INDEX "Report_laboratoryId_rectificationRootId_rectificationNumber_key" ON "Report"("laboratoryId", "rectificationRootId", "rectificationNumber");
