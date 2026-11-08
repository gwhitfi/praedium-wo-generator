-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "notificationsSeenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notificationTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "WorkOrderEvent_organizationId_createdAt_idx" ON "WorkOrderEvent"("organizationId", "createdAt");
