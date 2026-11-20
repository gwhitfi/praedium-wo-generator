-- AlterEnum
ALTER TYPE "EmailKind" ADD VALUE 'OVERDUE_REMINDER';

-- AlterEnum
ALTER TYPE "WorkOrderEventType" ADD VALUE 'REMINDER_SENT';

-- Organizations that exist now get the one-time "enroll past work orders" prompt; ones created later don't.
ALTER TABLE "Organization" ADD COLUMN     "remindersPromptPending" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ALTER COLUMN "remindersPromptPending" SET DEFAULT false;

-- Work orders that exist now start unenrolled from overdue reminders; ones created later are enrolled.
ALTER TABLE "WorkOrder" ADD COLUMN     "lastReminderAt" TIMESTAMP(3),
ADD COLUMN     "overdueReminders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminderCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WorkOrder" ALTER COLUMN "overdueReminders" SET DEFAULT true;

-- CreateIndex
CREATE INDEX "WorkOrder_status_dueDate_idx" ON "WorkOrder"("status", "dueDate");
