-- AlterEnum
ALTER TYPE "WorkOrderEventType" ADD VALUE 'VERIFIED';

-- CreateTable
CREATE TABLE "ContractorChallenge" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workOrderId" TEXT NOT NULL,

    CONSTRAINT "ContractorChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "remember" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,

    CONSTRAINT "ContractorSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractorChallenge_workOrderId_idx" ON "ContractorChallenge"("workOrderId");

-- CreateIndex
CREATE INDEX "ContractorChallenge_expiresAt_idx" ON "ContractorChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorSession_tokenHash_key" ON "ContractorSession"("tokenHash");

-- CreateIndex
CREATE INDEX "ContractorSession_email_idx" ON "ContractorSession"("email");

-- CreateIndex
CREATE INDEX "ContractorSession_expiresAt_idx" ON "ContractorSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "ContractorChallenge" ADD CONSTRAINT "ContractorChallenge_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
