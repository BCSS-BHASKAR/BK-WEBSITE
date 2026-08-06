-- RL / human-in-the-loop feedback for traffic violations.
-- feedback: NULL = not reviewed, 1 = thumbs up (confirmed true positive, stays in UI),
--           0 = thumbs down (false positive, hidden from UI + exported for retraining).
--
-- Apply: psql -U aiserver -d aiserver -f server/sql/violation_feedback.sql

ALTER TABLE traffic_violations
  ADD COLUMN IF NOT EXISTS feedback    SMALLINT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMP    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS feedback_by VARCHAR(191) DEFAULT NULL;

COMMENT ON COLUMN traffic_violations.feedback IS 'NULL=unrated,1=confirmed,0=false_positive';

CREATE INDEX IF NOT EXISTS idx_tv_feedback ON traffic_violations (feedback);
