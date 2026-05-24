-- Outbound webhooks: when a NON-internal Merchant's Order flips PAID, we
-- enqueue a MerchantOutboundWebhook row to be delivered (with retries) to
-- the merchant's webhook URL by the deliver-merchant-webhook worker.
--
-- Separate from inbound WebhookEvent (PSP → us) because shape, retry policy
-- and idempotency semantics differ.

CREATE TYPE "MerchantOutboundWebhookStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

CREATE TABLE "MerchantOutboundWebhook" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "MerchantOutboundWebhookStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantOutboundWebhook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MerchantOutboundWebhook_eventId_key" ON "MerchantOutboundWebhook"("eventId");
CREATE INDEX "MerchantOutboundWebhook_status_createdAt_idx" ON "MerchantOutboundWebhook"("status", "createdAt");
CREATE INDEX "MerchantOutboundWebhook_merchantId_createdAt_idx" ON "MerchantOutboundWebhook"("merchantId", "createdAt" DESC);
CREATE INDEX "MerchantOutboundWebhook_orderId_idx" ON "MerchantOutboundWebhook"("orderId");

-- Seed the cobalt.skin merchant. Phase 1 keeps the actual secrets in env
-- vars (MERCHANT_COBALT_*) so a DB leak doesn't expose them; this row exists
-- purely as the foreign-key anchor for Orders created via the deposit API.
-- isInternal=false flags Orders under this merchant for the outbound-webhook
-- pipeline (cobalt.skin gets notified on PAID) rather than the marketplace
-- buy-and-dispatch path.
INSERT INTO "Merchant" ("id", "name", "isInternal", "status", "settlementCurrency", "createdAt", "updatedAt")
VALUES ('m_cobalt_skin', 'Cobalt Skin', false, 'ACTIVE', 'USD', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;
