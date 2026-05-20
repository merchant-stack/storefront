-- Add WAXPEER to the SourceProvider enum so we can sync from Waxpeer alongside
-- (or instead of) DMarket.
ALTER TYPE "SourceProvider" ADD VALUE IF NOT EXISTS 'WAXPEER';
