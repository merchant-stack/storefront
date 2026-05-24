-- Add OWN_INVENTORY to the SourceProvider enum. This is the "our own Steam
-- bot inventory" provider — items physically held by our trading bot account,
-- sold directly from that inventory without any third-party marketplace in
-- the buy path. Pricing comes from public marketplace dumps (rust.tm /
-- DMarket / Waxpeer) used purely for price discovery, never for buys.
ALTER TYPE "SourceProvider" ADD VALUE IF NOT EXISTS 'OWN_INVENTORY';
