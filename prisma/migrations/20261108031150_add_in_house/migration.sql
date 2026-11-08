-- AlterEnum
ALTER TYPE "WorkOrderEventType" ADD VALUE 'STARTED';

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "inHouse" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "inHouse" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startedAt" TIMESTAMP(3);
