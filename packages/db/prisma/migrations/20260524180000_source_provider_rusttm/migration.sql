-- Add RUSTTM to the SourceProvider enum so we can sync from rust.tm
-- (TM-family Rust-skin marketplace, sister of market.csgo.com) alongside
-- the existing Waxpeer / DMarket providers.
ALTER TYPE "SourceProvider" ADD VALUE IF NOT EXISTS 'RUSTTM';
