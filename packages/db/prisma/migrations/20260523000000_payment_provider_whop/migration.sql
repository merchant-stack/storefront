-- Add WHOP to the PaymentProvider enum so card / Apple Pay / Google Pay
-- payments via Whop can be persisted alongside Stripe / NowPayments /
-- Coinbase Commerce. See packages/shared/src/payments/whop.ts.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'WHOP';
