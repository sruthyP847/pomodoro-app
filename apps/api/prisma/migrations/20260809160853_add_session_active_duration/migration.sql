-- Add `activeDurationMs` as a required column without dropping existing rows.
--
-- Prisma's generated statement would fail on a non-empty table. Instead: add
-- the column with a temporary default, backfill it, then drop the default so
-- the final shape matches the schema (required, no default).
--
-- Backfill uses the wall-clock span, which is the closest approximation
-- available for rows written before this column existed. It is exact for any
-- session that was never paused.

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "activeDurationMs" INTEGER NOT NULL DEFAULT 0;

UPDATE "Session"
SET "activeDurationMs" = GREATEST(
  0,
  ROUND(EXTRACT(EPOCH FROM ("endedAt" - "startedAt")) * 1000)
)::int
WHERE "endedAt" IS NOT NULL;

ALTER TABLE "Session" ALTER COLUMN "activeDurationMs" DROP DEFAULT;
