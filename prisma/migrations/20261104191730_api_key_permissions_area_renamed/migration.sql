-- AlterEnum
ALTER TYPE "WorkOrderEventType" ADD VALUE 'AREA_RENAMED';

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "canChangeStatus" BOOLEAN NOT NULL DEFAULT false;
