-- ---------------------------------------------------------------------------
-- Production migration — run BEFORE deploying this build.
--
--   psql -U <user> -d <database> -f server/sql/2026-07-alert-type-and-gender.sql
--
-- Adds the two columns the new Alerts and Walk-ins screens depend on:
--
--   crowds.alert_type  -> powers the Intrusions / Unauthorized Access /
--                         Camera Tampering / Unattended Kitchen / Understaffed
--                         Kitchen tiles, the "Alert type" filter, and the type
--                         split in every chart on the Active Alerts page.
--   walkins.gender     -> powers the "Gender" filter and the "By gender" donut
--                         on the Walk-ins page.
--
-- Without these columns the API returns 500 on:
--   GET /api/dashboard/crowds-range-stats
--   GET /api/dashboard/crowds-report-events
--   GET /api/dashboard/walkins-range-stats
--   GET /api/dashboard/walkins-report-events
--
-- Both columns are NOT NULL with a safe default, so existing rows stay valid and
-- inserts that do not mention them keep working. On PostgreSQL 11+ neither ADD
-- COLUMN rewrites the table, but both take an ACCESS EXCLUSIVE lock — run them
-- in a low-traffic window on a large table. The CHECK constraints are added
-- separately as NOT VALID + VALIDATE so the validation scan only needs a SHARE
-- UPDATE EXCLUSIVE lock.
--
-- The MySQL build used ENUM columns; here they are VARCHAR + CHECK, which reads
-- back identically in the API and is far cheaper to extend later.
--
-- IMPORTANT: after this migration the inference pipeline must start WRITING these
-- columns. Until it does, every new crowd alert lands as 'intrusion' and every
-- walk-in as 'unknown', so the tiles and donut will look one-sided.
-- ---------------------------------------------------------------------------

BEGIN;

-- --------------------------------------------------------------------------
-- 1. crowds.alert_type
--
-- Postgres has no AFTER <column>; column order is not part of the contract.
-- --------------------------------------------------------------------------

ALTER TABLE crowds
  ADD COLUMN IF NOT EXISTS alert_type VARCHAR(32) NOT NULL DEFAULT 'intrusion';

ALTER TABLE crowds
  DROP CONSTRAINT IF EXISTS ck_crowds_alert_type;

ALTER TABLE crowds
  ADD CONSTRAINT ck_crowds_alert_type CHECK (alert_type IN
    ('intrusion','unauthorized_access','camera_tampering','unattended_kitchen','understaffed_kitchen'))
  NOT VALID;

-- --------------------------------------------------------------------------
-- 2. walkins.gender
-- --------------------------------------------------------------------------

ALTER TABLE walkins
  ADD COLUMN IF NOT EXISTS gender VARCHAR(16) NOT NULL DEFAULT 'unknown';

ALTER TABLE walkins
  DROP CONSTRAINT IF EXISTS ck_walkins_gender;

ALTER TABLE walkins
  ADD CONSTRAINT ck_walkins_gender CHECK (gender IN ('male','female','unknown'))
  NOT VALID;

COMMIT;

-- --------------------------------------------------------------------------
-- If an earlier build of this migration already ran, alert_type exists with the
-- old three values ('intrusion','chef','camera_tampering'). Fold 'chef' into
-- 'understaffed_kitchen' BEFORE validating the constraint above.
--
-- UPDATE crowds SET alert_type = 'understaffed_kitchen' WHERE alert_type = 'chef';
-- --------------------------------------------------------------------------

-- Validation scans the table but only takes SHARE UPDATE EXCLUSIVE, so reads
-- and writes keep flowing. Safe to run separately from the transaction above.
ALTER TABLE crowds  VALIDATE CONSTRAINT ck_crowds_alert_type;
ALTER TABLE walkins VALIDATE CONSTRAINT ck_walkins_gender;

CREATE INDEX IF NOT EXISTS idx_crowds_alert_type ON crowds (alert_type);
CREATE INDEX IF NOT EXISTS idx_walkins_gender    ON walkins (gender);

-- --------------------------------------------------------------------------
-- Verification
-- --------------------------------------------------------------------------

SELECT alert_type, COUNT(*) AS rows_by_type   FROM crowds  GROUP BY alert_type;
SELECT gender,     COUNT(*) AS rows_by_gender FROM walkins GROUP BY gender;

-- ---------------------------------------------------------------------------
-- Rollback (only if you need to revert the deploy)
-- ---------------------------------------------------------------------------
-- ALTER TABLE crowds  DROP CONSTRAINT IF EXISTS ck_crowds_alert_type;
-- ALTER TABLE walkins DROP CONSTRAINT IF EXISTS ck_walkins_gender;
-- DROP INDEX IF EXISTS idx_crowds_alert_type;
-- DROP INDEX IF EXISTS idx_walkins_gender;
-- ALTER TABLE crowds  DROP COLUMN IF EXISTS alert_type;
-- ALTER TABLE walkins DROP COLUMN IF EXISTS gender;

-- ---------------------------------------------------------------------------
-- DO NOT RUN IN PRODUCTION — local demo seeding only.
--
-- These fill the new columns with random values so the local dataset has a
-- realistic spread. On real data they would destroy genuine classifications.
-- ---------------------------------------------------------------------------
--
-- UPDATE crowds SET alert_type = (ARRAY[
--   'intrusion','intrusion','intrusion','intrusion','intrusion',
--   'intrusion','intrusion','intrusion','intrusion','intrusion',
--   'understaffed_kitchen','understaffed_kitchen','understaffed_kitchen','understaffed_kitchen',
--   'unattended_kitchen','unattended_kitchen','unattended_kitchen',
--   'camera_tampering','camera_tampering','camera_tampering'
-- ])[(FLOOR(RANDOM() * 20) + 1)::int];
--
-- UPDATE walkins SET gender = (ARRAY[
--   'male','male','male','male','male','male','male','male','male','male','male',
--   'female','female','female','female','female','female','female',
--   'unknown','unknown'
-- ])[(FLOOR(RANDOM() * 20) + 1)::int];
