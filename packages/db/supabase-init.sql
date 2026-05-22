-- Combined schema for first-time Supabase setup.
-- Generated from prisma/migrations/* on 2026-05-21.
-- Run once in Supabase SQL Editor on a fresh project.
-- IDEMPOTENT: safe to re-run; drops everything in `public` first.

-- ============================================================================
-- Wipe — drop our tables and types so the script can be re-run cleanly.
-- Does NOT touch other schemas (auth, storage, etc.), only `public`.
-- ============================================================================

DROP TABLE IF EXISTS "AuditLog" CASCADE;
DROP TABLE IF EXISTS "WebhookEvent" CASCADE;
DROP TABLE IF EXISTS "Trade" CASCADE;
DROP TABLE IF EXISTS "Payment" CASCADE;
DROP TABLE IF EXISTS "SourceTransaction" CASCADE;
DROP TABLE IF EXISTS "SourceItem" CASCADE;
DROP TABLE IF EXISTS "OrderItem" CASCADE;
DROP TABLE IF EXISTS "Order" CASCADE;
DROP TABLE IF EXISTS "Merchant" CASCADE;
DROP TABLE IF EXISTS "Listing" CASCADE;
DROP TABLE IF EXISTS "PriceSnapshot" CASCADE;
DROP TABLE IF EXISTS "InventoryItem" CASCADE;
DROP TABLE IF EXISTS "SteamItem" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;

DROP TYPE IF EXISTS "ActorType" CASCADE;
DROP TYPE IF EXISTS "TradeStatus" CASCADE;
DROP TYPE IF EXISTS "PaymentStatus" CASCADE;
DROP TYPE IF EXISTS "PaymentProvider" CASCADE;
DROP TYPE IF EXISTS "OrderStatus" CASCADE;
DROP TYPE IF EXISTS "MerchantStatus" CASCADE;
DROP TYPE IF EXISTS "ListingStatus" CASCADE;
DROP TYPE IF EXISTS "PriceSource" CASCADE;
DROP TYPE IF EXISTS "UserRole" CASCADE;
DROP TYPE IF EXISTS "SourceTransactionState" CASCADE;
DROP TYPE IF EXISTS "SourceProvider" CASCADE;

-- ============================================================================
-- Migration 20260518121357_init
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "PriceSource" AS ENUM ('STEAM_MARKET', 'CUSTOM', 'EXTERNAL_API');
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'RESERVED', 'SOLD', 'CANCELLED', 'EXPIRED');
CREATE TYPE "MerchantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'FULFILLING', 'FULFILLED', 'FAILED', 'CANCELLED', 'REFUNDED');
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'NOWPAYMENTS', 'COINBASE_COMMERCE');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED');
CREATE TYPE "TradeStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'ESCROW', 'INVALID', 'FAILED');
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'ADMIN', 'MERCHANT');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "steamId64" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "tradeUrl" TEXT,
    "email" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SteamItem" (
    "id" TEXT NOT NULL,
    "appId" INTEGER NOT NULL,
    "classId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL DEFAULT '0',
    "marketHashName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "iconUrl" TEXT,
    "type" TEXT,
    "rarity" TEXT,
    "marketable" BOOLEAN NOT NULL DEFAULT true,
    "tradable" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SteamItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steamItemId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "tradable" BOOLEAN NOT NULL DEFAULT true,
    "tradableAfter" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "steamItemId" TEXT NOT NULL,
    "source" "PriceSource" NOT NULL DEFAULT 'STEAM_MARKET',
    "medianPriceMinor" INTEGER,
    "lowestPriceMinor" INTEGER,
    "volume" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "steamItemId" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "reservedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "status" "MerchantStatus" NOT NULL DEFAULT 'ACTIVE',
    "apiKeyHash" TEXT,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT,
    "settlementCurrency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "buyerId" TEXT,
    "buyerEmail" TEXT,
    "buyerSteamId64" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "totalAmountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "metadata" JSONB,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "listingId" TEXT,
    "itemName" TEXT NOT NULL,
    "iconUrl" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerSessionId" TEXT,
    "providerPaymentIntentId" TEXT,
    "providerChargeId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "rawProviderData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "succeededAt" TIMESTAMP(3),
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "botSteamId64" TEXT NOT NULL,
    "buyerSteamId64" TEXT NOT NULL,
    "buyerTradeUrl" TEXT NOT NULL,
    "tradeOfferId" TEXT,
    "status" "TradeStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "escrowEndsAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "rawSteamPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_steamId64_key" ON "User"("steamId64");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_steamId64_idx" ON "User"("steamId64");
CREATE INDEX "SteamItem_appId_type_idx" ON "SteamItem"("appId", "type");
CREATE UNIQUE INDEX "SteamItem_appId_classId_instanceId_key" ON "SteamItem"("appId", "classId", "instanceId");
CREATE UNIQUE INDEX "SteamItem_appId_marketHashName_key" ON "SteamItem"("appId", "marketHashName");
CREATE INDEX "InventoryItem_userId_idx" ON "InventoryItem"("userId");
CREATE INDEX "InventoryItem_steamItemId_idx" ON "InventoryItem"("steamItemId");
CREATE UNIQUE INDEX "InventoryItem_userId_assetId_key" ON "InventoryItem"("userId", "assetId");
CREATE INDEX "PriceSnapshot_steamItemId_createdAt_idx" ON "PriceSnapshot"("steamItemId", "createdAt" DESC);
CREATE UNIQUE INDEX "Listing_inventoryItemId_key" ON "Listing"("inventoryItemId");
CREATE INDEX "Listing_status_steamItemId_idx" ON "Listing"("status", "steamItemId");
CREATE INDEX "Listing_sellerId_status_idx" ON "Listing"("sellerId", "status");
CREATE INDEX "Listing_status_priceMinor_idx" ON "Listing"("status", "priceMinor");
CREATE UNIQUE INDEX "Merchant_apiKeyHash_key" ON "Merchant"("apiKeyHash");
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");
CREATE INDEX "Order_merchantId_status_idx" ON "Order"("merchantId", "status");
CREATE INDEX "Order_buyerId_createdAt_idx" ON "Order"("buyerId", "createdAt" DESC);
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt" DESC);
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_listingId_idx" ON "OrderItem"("listingId");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");
CREATE INDEX "Payment_providerSessionId_idx" ON "Payment"("providerSessionId");
CREATE INDEX "Payment_providerPaymentIntentId_idx" ON "Payment"("providerPaymentIntentId");
CREATE INDEX "Payment_provider_status_idx" ON "Payment"("provider", "status");
CREATE INDEX "Trade_orderId_idx" ON "Trade"("orderId");
CREATE INDEX "Trade_status_createdAt_idx" ON "Trade"("status", "createdAt");
CREATE INDEX "Trade_tradeOfferId_idx" ON "Trade"("tradeOfferId");
CREATE INDEX "WebhookEvent_processed_createdAt_idx" ON "WebhookEvent"("processed", "createdAt");
CREATE UNIQUE INDEX "WebhookEvent_provider_providerEventId_key" ON "WebhookEvent"("provider", "providerEventId");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_actorType_actorId_createdAt_idx" ON "AuditLog"("actorType", "actorId", "createdAt" DESC);

ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_steamItemId_fkey" FOREIGN KEY ("steamItemId") REFERENCES "SteamItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_steamItemId_fkey" FOREIGN KEY ("steamItemId") REFERENCES "SteamItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_steamItemId_fkey" FOREIGN KEY ("steamItemId") REFERENCES "SteamItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_user_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Migration 20260518150000_arbitrage
-- ============================================================================

CREATE TYPE "SourceProvider" AS ENUM ('DMARKET', 'SKINPORT', 'LIS_SKINS');
CREATE TYPE "SourceTransactionState" AS ENUM ('PENDING', 'EXECUTING', 'SUCCESS', 'FAILED', 'REFUND_REQUIRED');

ALTER TYPE "PriceSource" ADD VALUE 'DMARKET';

ALTER TABLE "OrderItem" ADD COLUMN "sourceItemId" TEXT;

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

CREATE INDEX "SourceItem_available_gameId_salePriceMinor_idx" ON "SourceItem"("available", "gameId", "salePriceMinor");
CREATE INDEX "SourceItem_steamItemId_idx" ON "SourceItem"("steamItemId");
CREATE INDEX "SourceItem_lastSyncedAt_idx" ON "SourceItem"("lastSyncedAt");
CREATE UNIQUE INDEX "SourceItem_provider_sourceOfferId_key" ON "SourceItem"("provider", "sourceOfferId");
CREATE INDEX "SourceTransaction_orderId_idx" ON "SourceTransaction"("orderId");
CREATE INDEX "SourceTransaction_state_createdAt_idx" ON "SourceTransaction"("state", "createdAt");
CREATE INDEX "SourceTransaction_provider_sourcePaymentId_idx" ON "SourceTransaction"("provider", "sourcePaymentId");
CREATE INDEX "OrderItem_sourceItemId_idx" ON "OrderItem"("sourceItemId");

ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_steamItemId_fkey" FOREIGN KEY ("steamItemId") REFERENCES "SteamItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SourceTransaction" ADD CONSTRAINT "SourceTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Migration 20260520120000_drop_listing_inventory
-- ============================================================================

DROP INDEX IF EXISTS "OrderItem_listingId_idx";
ALTER TABLE "OrderItem" DROP CONSTRAINT IF EXISTS "OrderItem_listingId_fkey";
ALTER TABLE "OrderItem" DROP COLUMN IF EXISTS "listingId";

DROP INDEX IF EXISTS "Listing_status_steamItemId_idx";
DROP INDEX IF EXISTS "Listing_sellerId_status_idx";
DROP INDEX IF EXISTS "Listing_status_priceMinor_idx";
DROP TABLE IF EXISTS "Listing";

DROP INDEX IF EXISTS "InventoryItem_userId_idx";
DROP INDEX IF EXISTS "InventoryItem_steamItemId_idx";
DROP INDEX IF EXISTS "InventoryItem_userId_assetId_key";
DROP TABLE IF EXISTS "InventoryItem";

DROP TYPE IF EXISTS "ListingStatus";

-- ============================================================================
-- Migration 20260520180000_source_item_bg_color
-- ============================================================================

ALTER TABLE "SourceItem" ADD COLUMN IF NOT EXISTS "iconBackgroundColor" TEXT;

-- ============================================================================
-- Migration 20260520200000_source_provider_waxpeer
-- ============================================================================

ALTER TYPE "SourceProvider" ADD VALUE IF NOT EXISTS 'WAXPEER';


-- ============================================================================
-- Seed: internal merchant row
-- Required because the storefront is single-tenant — every Order references
-- this fixed merchantId. Without it POST /api/checkout fails with a foreign
-- key violation (Order_merchantId_fkey). Safe to re-run.
-- ============================================================================

INSERT INTO "Merchant" (id, name, "isInternal", status, "settlementCurrency", "createdAt", "updatedAt")
VALUES ('internal-merchant', 'RustSupply Marketplace', true, 'ACTIVE', 'USD', now(), now())
ON CONFLICT (id) DO NOTHING;
