-- CreateEnum
CREATE TYPE "WorkOrderEventType" AS ENUM ('CREATED', 'EDITED', 'SENT', 'CONTRACTOR_CHANGED', 'COMPLETED_BY_OFFICE', 'CANCELLED', 'REOPENED', 'CLOSED', 'ARCHIVED', 'RESTORED', 'PHOTO_ADDED', 'PHOTO_REMOVED', 'OPENED', 'ITEM_CHECKED', 'ITEM_UNCHECKED', 'NOTE_SAVED', 'COMPLETED_BY_CONTRACTOR');

-- CreateTable
CREATE TABLE "WorkOrderEvent" (
    "id" TEXT NOT NULL,
    "type" "WorkOrderEventType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byContractor" BOOLEAN NOT NULL DEFAULT false,
    "actorName" TEXT,
    "actorUserId" TEXT,
    "detail" JSONB,
    "dedupeKey" TEXT,
    "workOrderId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "WorkOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrderEvent_workOrderId_createdAt_idx" ON "WorkOrderEvent"("workOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkOrderEvent_organizationId_idx" ON "WorkOrderEvent"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderEvent_workOrderId_dedupeKey_key" ON "WorkOrderEvent"("workOrderId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "WorkOrderEvent" ADD CONSTRAINT "WorkOrderEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderEvent" ADD CONSTRAINT "WorkOrderEvent_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderEvent" ADD CONSTRAINT "WorkOrderEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (hand-written): history for existing work orders, rebuilt from the timestamps they already have.
-- Every row is marked {"backfilled": true}. Office events have no actor (who did them wasn't recorded).
-- Only the latest round is recoverable: reopening clears completedAt, closedAt and cancelledAt.
-- Postgres can't make cuids, so these rows use UUIDs; "id" is plain text, so both work.

INSERT INTO "WorkOrderEvent" ("id", "type", "createdAt", "byContractor", "detail", "workOrderId", "organizationId")
SELECT gen_random_uuid()::text, 'CREATED'::"WorkOrderEventType", w."createdAt", false,
       jsonb_build_object('backfilled', true), w."id", w."organizationId"
FROM "WorkOrder" w;

INSERT INTO "WorkOrderEvent" ("id", "type", "createdAt", "byContractor", "detail", "workOrderId", "organizationId")
SELECT gen_random_uuid()::text, 'SENT'::"WorkOrderEventType", w."sentAt", false,
       jsonb_strip_nulls(jsonb_build_object('backfilled', true, 'deliveryMethod', w."deliveryMethod")),
       w."id", w."organizationId"
FROM "WorkOrder" w
WHERE w."sentAt" IS NOT NULL;

-- Checking items off is contractor-only, so these are the contractor's. Named with the work order's current
-- contractor, the best record available.
INSERT INTO "WorkOrderEvent"
    ("id", "type", "createdAt", "byContractor", "actorName", "detail", "workOrderId", "organizationId")
SELECT gen_random_uuid()::text, 'ITEM_CHECKED'::"WorkOrderEventType", li."completedAt", true, w."contractorName",
       jsonb_build_object('backfilled', true, 'item', li."description", 'area', a."name"),
       w."id", w."organizationId"
FROM "LineItem" li
JOIN "Area" a ON a."id" = li."areaId"
JOIN "WorkOrder" w ON w."id" = a."workOrderId"
WHERE li."completed" AND li."completedAt" IS NOT NULL;

-- Either side can mark a work order complete, and which one did wasn't recorded. Only contractors leave
-- completion notes, so notes mean the contractor; otherwise it's assumed to be the office. No actor either way,
-- and the Activity section shows backfilled completions without a name.
INSERT INTO "WorkOrderEvent" ("id", "type", "createdAt", "byContractor", "detail", "workOrderId", "organizationId")
SELECT gen_random_uuid()::text,
       CASE WHEN w."completionNotes" IS NOT NULL
            THEN 'COMPLETED_BY_CONTRACTOR'::"WorkOrderEventType"
            ELSE 'COMPLETED_BY_OFFICE'::"WorkOrderEventType" END,
       w."completedAt", false, jsonb_build_object('backfilled', true), w."id", w."organizationId"
FROM "WorkOrder" w
WHERE w."completedAt" IS NOT NULL;

INSERT INTO "WorkOrderEvent" ("id", "type", "createdAt", "byContractor", "detail", "workOrderId", "organizationId")
SELECT gen_random_uuid()::text, 'CLOSED'::"WorkOrderEventType", w."closedAt", false,
       jsonb_build_object('backfilled', true), w."id", w."organizationId"
FROM "WorkOrder" w
WHERE w."closedAt" IS NOT NULL;

INSERT INTO "WorkOrderEvent" ("id", "type", "createdAt", "byContractor", "detail", "workOrderId", "organizationId")
SELECT gen_random_uuid()::text, 'CANCELLED'::"WorkOrderEventType", w."cancelledAt", false,
       jsonb_strip_nulls(jsonb_build_object('backfilled', true, 'reason', w."cancelReason")),
       w."id", w."organizationId"
FROM "WorkOrder" w
WHERE w."cancelledAt" IS NOT NULL;
