-- Add SHOWCASE to SourceProvider enum. Showcase rows are placeholder catalog
-- entries the storefront displays as "coming soon" — we don't actually have
-- them in our bot inventory. Lets the catalog feel fuller without misleading
-- customers (checkout for SHOWCASE rows is rejected server-side and the
-- web UI shows a distinct "Ожидаем поступления" badge instead of a Buy CTA).
ALTER TYPE "SourceProvider" ADD VALUE IF NOT EXISTS 'SHOWCASE';
