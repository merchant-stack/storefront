-- RustSkinPay dev seed — mirrors prisma/seed.ts but applied via Supabase SQL Editor
-- because Dmitriy's network blocks direct PG protocol (see memory: network-postgres-tls-blocked).
-- Safe to re-run.

BEGIN;

-- Internal merchant (used for all Phase 1 marketplace orders)
INSERT INTO "Merchant" (id, name, "isInternal", status, "settlementCurrency", "createdAt", "updatedAt")
VALUES ('internal-merchant', 'RustSkinPay Marketplace', true, 'ACTIVE', 'USD', now(), now())
ON CONFLICT (id) DO NOTHING;

-- Demo seller user
INSERT INTO "User" (id, "steamId64", "displayName", "avatarUrl", role, "createdAt", "updatedAt")
VALUES ('demo-seller', '76561198000000001', 'DemoSeller', NULL, 'USER', now(), now())
ON CONFLICT ("steamId64") DO NOTHING;

-- Sample Rust SteamItems (icons are placeholders until real Steam icon URLs are wired in)
INSERT INTO "SteamItem" (id, "appId", "classId", "instanceId", "marketHashName", "displayName", "iconUrl", type, rarity, marketable, tradable, "lastSyncedAt", "createdAt")
VALUES
  ('item-900001', 252490, '900001', '0', 'Tempered AK47',              'Tempered AK47',              'https://placehold.co/300x300/2a2a2a/f97316?text=Tempered+AK47',   'Weapon',    'Rare',     true, true, now(), now()),
  ('item-900002', 252490, '900002', '0', 'Whiteout Hoodie',            'Whiteout Hoodie',            'https://placehold.co/300x300/2a2a2a/64748b?text=Whiteout+Hoodie', 'Clothing',  'Common',   true, true, now(), now()),
  ('item-900003', 252490, '900003', '0', 'Glowing Eyes',               'Glowing Eyes',               'https://placehold.co/300x300/2a2a2a/a855f7?text=Glowing+Eyes',    'Face Mask', 'Epic',     true, true, now(), now()),
  ('item-900004', 252490, '900004', '0', 'Forest Camo Bandana',        'Forest Camo Bandana',        'https://placehold.co/300x300/2a2a2a/4ade80?text=Forest+Camo',     'Bandana',   'Uncommon', true, true, now(), now()),
  ('item-900005', 252490, '900005', '0', 'Blackout Door',              'Blackout Door',              'https://placehold.co/300x300/2a2a2a/dc2626?text=Blackout+Door',   'Door',      'Rare',     true, true, now(), now()),
  ('item-900006', 252490, '900006', '0', 'Wasteland Metal Chestplate', 'Wasteland Metal Chestplate', 'https://placehold.co/300x300/2a2a2a/9333ea?text=Wasteland+Armor', 'Armor',     'Epic',     true, true, now(), now())
ON CONFLICT ("appId", "classId", "instanceId") DO NOTHING;

-- Inventory items owned by the demo seller
INSERT INTO "InventoryItem" (id, "userId", "steamItemId", "assetId", tradable, "lastSyncedAt", "createdAt")
VALUES
  ('inv-900001', 'demo-seller', 'item-900001', 'seed_900001', true, now(), now()),
  ('inv-900002', 'demo-seller', 'item-900002', 'seed_900002', true, now(), now()),
  ('inv-900003', 'demo-seller', 'item-900003', 'seed_900003', true, now(), now()),
  ('inv-900004', 'demo-seller', 'item-900004', 'seed_900004', true, now(), now()),
  ('inv-900005', 'demo-seller', 'item-900005', 'seed_900005', true, now(), now()),
  ('inv-900006', 'demo-seller', 'item-900006', 'seed_900006', true, now(), now())
ON CONFLICT ("userId", "assetId") DO NOTHING;

-- Active listings on the marketplace
INSERT INTO "Listing" (id, "sellerId", "inventoryItemId", "steamItemId", "priceMinor", currency, status, "createdAt", "updatedAt")
VALUES
  ('list-900001', 'demo-seller', 'inv-900001', 'item-900001',  2499, 'USD', 'ACTIVE', now(), now()),
  ('list-900002', 'demo-seller', 'inv-900002', 'item-900002',   599, 'USD', 'ACTIVE', now(), now()),
  ('list-900003', 'demo-seller', 'inv-900003', 'item-900003', 12999, 'USD', 'ACTIVE', now(), now()),
  ('list-900004', 'demo-seller', 'inv-900004', 'item-900004',   349, 'USD', 'ACTIVE', now(), now()),
  ('list-900005', 'demo-seller', 'inv-900005', 'item-900005',  1849, 'USD', 'ACTIVE', now(), now()),
  ('list-900006', 'demo-seller', 'inv-900006', 'item-900006',  8499, 'USD', 'ACTIVE', now(), now())
ON CONFLICT ("inventoryItemId") DO NOTHING;

COMMIT;
