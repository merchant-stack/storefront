-- Add display-plate background color (from DMarket extra.backgroundColor) so
-- each item's icon sits on the colour palette the source picked for it.
ALTER TABLE "SourceItem" ADD COLUMN IF NOT EXISTS "iconBackgroundColor" TEXT;
