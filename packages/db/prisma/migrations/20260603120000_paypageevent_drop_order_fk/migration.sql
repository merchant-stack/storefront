-- Drop the Order foreign key on PayPageEvent so cobalt-hosted /pay sessions
-- (cmvd… ids that have no Order row on our side) can be recorded for analytics.
-- orderId stays a plain string column; it just no longer enforces a FK.
ALTER TABLE "PayPageEvent" DROP CONSTRAINT IF EXISTS "PayPageEvent_orderId_fkey";
