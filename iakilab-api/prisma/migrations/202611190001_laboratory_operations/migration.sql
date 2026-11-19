-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "laboratoryId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sample" (
    "id" UUID NOT NULL,
    "laboratoryId" UUID NOT NULL,
    "identification" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "analyses" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Sample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportEvent" (
    "id" UUID NOT NULL,
    "laboratoryId" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_laboratoryId_active_name_idx" ON "Client"("laboratoryId", "active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_laboratoryId_id_key" ON "Client"("laboratoryId", "id");

-- CreateIndex
CREATE INDEX "Sample_laboratoryId_active_collectedAt_idx" ON "Sample"("laboratoryId", "active", "collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sample_laboratoryId_id_key" ON "Sample"("laboratoryId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Sample_laboratoryId_identification_key" ON "Sample"("laboratoryId", "identification");

-- CreateIndex
CREATE UNIQUE INDEX "ReportEvent_laboratoryId_reportId_revision_key" ON "ReportEvent"("laboratoryId", "reportId", "revision");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sample" ADD CONSTRAINT "Sample_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportEvent" ADD CONSTRAINT "ReportEvent_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportEvent" ADD CONSTRAINT "ReportEvent_laboratoryId_reportId_fkey" FOREIGN KEY ("laboratoryId", "reportId") REFERENCES "Report"("laboratoryId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

