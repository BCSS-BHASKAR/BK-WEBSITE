-- ---------------------------------------------------------------------------
-- Production migration — run BEFORE deploying this build.
--
--   mysql -u <user> -p <database> < server/sql/2026-07-alert-type-and-gender.sql
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
-- inserts that do not mention them keep working. Neither ALTER rewrites data, but
-- both take a metadata lock — run them in a low-traffic window on a large table.
--
-- IMPORTANT: after this migration the inference pipeline must start WRITING these
-- columns. Until it does, every new crowd alert lands as 'intrusion' and every
-- walk-in as 'unknown', so the tiles and donut will look one-sided.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- 1. crowds.alert_type
-- --------------------------------------------------------------------------

ALTER TABLE `crowds`
  ADD COLUMN `alert_type`
    ENUM('intrusion','unauthorized_access','camera_tampering','unattended_kitchen','understaffed_kitchen')
    NOT NULL DEFAULT 'intrusion' AFTER `camera_id`,
  ADD KEY `idx_crowds_alert_type` (`alert_type`);

-- If an earlier build of this migration already ran, the column exists with the
-- old three values ('intrusion','chef','camera_tampering'). Run this block
-- instead of the ALTER above to bring it up to date without losing rows.
--
-- ALTER TABLE `crowds`
--   MODIFY COLUMN `alert_type`
--     ENUM('intrusion','chef','unauthorized_access','camera_tampering',
--          'unattended_kitchen','understaffed_kitchen')
--     NOT NULL DEFAULT 'intrusion';
-- UPDATE `crowds` SET alert_type = 'understaffed_kitchen' WHERE alert_type = 'chef';
-- ALTER TABLE `crowds`
--   MODIFY COLUMN `alert_type`
--     ENUM('intrusion','unauthorized_access','camera_tampering',
--          'unattended_kitchen','understaffed_kitchen')
--     NOT NULL DEFAULT 'intrusion';

-- --------------------------------------------------------------------------
-- 2. walkins.gender
-- --------------------------------------------------------------------------

ALTER TABLE `walkins`
  ADD COLUMN `gender` ENUM('male','female','unknown')
    NOT NULL DEFAULT 'unknown' AFTER `camera_id`,
  ADD KEY `idx_walkins_gender` (`gender`);

-- --------------------------------------------------------------------------
-- Verification
-- --------------------------------------------------------------------------

SELECT alert_type, COUNT(*) AS rows_by_type FROM `crowds`  GROUP BY alert_type;
SELECT gender,     COUNT(*) AS rows_by_gender FROM `walkins` GROUP BY gender;

-- ---------------------------------------------------------------------------
-- Rollback (only if you need to revert the deploy)
-- ---------------------------------------------------------------------------
-- ALTER TABLE `crowds`  DROP KEY `idx_crowds_alert_type`,  DROP COLUMN `alert_type`;
-- ALTER TABLE `walkins` DROP KEY `idx_walkins_gender`,     DROP COLUMN `gender`;

-- ---------------------------------------------------------------------------
-- DO NOT RUN IN PRODUCTION — local demo seeding only.
--
-- These fill the new columns with random values so the local dataset has a
-- realistic spread. On real data they would destroy genuine classifications.
-- ---------------------------------------------------------------------------
--
-- UPDATE `crowds` SET alert_type = ELT(FLOOR(RAND() * 20) + 1,
--   'intrusion','intrusion','intrusion','intrusion','intrusion',
--   'intrusion','intrusion','intrusion','intrusion','intrusion',
--   'understaffed_kitchen','understaffed_kitchen','understaffed_kitchen','understaffed_kitchen',
--   'unattended_kitchen','unattended_kitchen','unattended_kitchen',
--   'camera_tampering','camera_tampering','camera_tampering');
--
-- UPDATE `walkins` SET gender = ELT(FLOOR(RAND() * 20) + 1,
--   'male','male','male','male','male','male','male','male','male','male','male',
--   'female','female','female','female','female','female','female',
--   'unknown','unknown');
