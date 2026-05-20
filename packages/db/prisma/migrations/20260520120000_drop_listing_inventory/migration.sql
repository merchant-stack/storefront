-- Drop legacy Listing + InventoryItem tables (post-pivot cleanup).
-- These came from the original user-listed marketplace model that was
-- replaced by the DMarket-arbitrage SourceItem flow on 2026-05-18.
-- OrderItem.listingId is dropped along with the FK.

-- Drop OrderItem dependency first.
DROP INDEX IF EXISTS "OrderItem_listingId_idx";
ALTER TABLE "OrderItem" DROP CONSTRAINT IF EXISTS "OrderItem_listingId_fkey";
ALTER TABLE "OrderItem" DROP COLUMN IF EXISTS "listingId";

-- Drop Listing table (depends on InventoryItem + User + SteamItem).
DROP INDEX IF EXISTS "Listing_status_steamItemId_idx";
DROP INDEX IF EXISTS "Listing_sellerId_status_idx";
DROP INDEX IF EXISTS "Listing_status_priceMinor_idx";
DROP TABLE IF EXISTS "Listing";

-- Drop InventoryItem table.
DROP INDEX IF EXISTS "InventoryItem_userId_idx";
DROP INDEX IF EXISTS "InventoryItem_steamItemId_idx";
DROP INDEX IF EXISTS "InventoryItem_userId_assetId_key";
DROP TABLE IF EXISTS "InventoryItem";

-- Drop the enum used only by Listing.
DROP TYPE IF EXISTS "ListingStatus";
