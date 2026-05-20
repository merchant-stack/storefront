-- CreateEnum
CREATE TYPE "SourceProvider" AS ENUM ('DMARKET', 'SKINPORT', 'LIS_SKINS');

-- CreateEnum
CREATE TYPE "SourceTransactionState" AS ENUM ('PENDING', 'EXECUTING', 'SUCCESS', 'FAILED', 'REFUND_REQUIRED');

-- AlterEnum
ALTER TYPE "PriceSource" ADD VALUE 'DMARKET';

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "sourceItemId" TEXT;

-- CreateTable
CREATE TABLE "SourceItem" (
    "id" TEXT NOT NULL,
    "provider" "SourceProvider" NOT NULL,
    "sourceOfferId" TEXT NOT NULL,
    "steamItemId" TEXT,
    "gameId" TEXT NOT NULL,
    "marketHashName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "iconUrl" TEXT,
    "type" TEXT,
    "rarity" TEXT,
    "sourcePriceMinor" INTEGER NOT NULL,
    "salePriceMinor" INTEGER NOT NULL,
    "markupBps" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "available" BOOLEAN NOT NULL DEFAULT true,
    "rawPayload" JSONB,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceTransaction" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "SourceProvider" NOT NULL,
    "sourceOfferId" TEXT NOT NULL,
    "sourcePaymentId" TEXT,
    "state" "SourceTransactionState" NOT NULL DEFAULT 'PENDING',
    "amountSpentMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "rawRequest" JSONB,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "succeededAt" TIMESTAMP(3),

    CONSTRAINT "SourceTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceItem_available_gameId_salePriceMinor_idx" ON "SourceItem"("available", "gameId", "salePriceMinor");

-- CreateIndex
CREATE INDEX "SourceItem_steamItemId_idx" ON "SourceItem"("steamItemId");

-- CreateIndex
CREATE INDEX "SourceItem_lastSyncedAt_idx" ON "SourceItem"("lastSyncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceItem_provider_sourceOfferId_key" ON "SourceItem"("provider", "sourceOfferId");

-- CreateIndex
CREATE INDEX "SourceTransaction_orderId_idx" ON "SourceTransaction"("orderId");

-- CreateIndex
CREATE INDEX "SourceTransaction_state_createdAt_idx" ON "SourceTransaction"("state", "createdAt");

-- CreateIndex
CREATE INDEX "SourceTransaction_provider_sourcePaymentId_idx" ON "SourceTransaction"("provider", "sourcePaymentId");

-- CreateIndex
CREATE INDEX "OrderItem_sourceItemId_idx" ON "OrderItem"("sourceItemId");

-- AddForeignKey
ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_steamItemId_fkey" FOREIGN KEY ("steamItemId") REFERENCES "SteamItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceTransaction" ADD CONSTRAINT "SourceTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
