-- RL / human-in-the-loop feedback for traffic violations.
-- feedback: NULL = not reviewed, 1 = thumbs up (confirmed true positive, stays in UI),
--           0 = thumbs down (false positive, hidden from UI + exported for retraining).
ALTER TABLE `traffic_violations`
  ADD COLUMN `feedback` TINYINT DEFAULT NULL COMMENT 'NULL=unrated,1=confirmed,0=false_positive',
  ADD COLUMN `feedback_at` DATETIME DEFAULT NULL,
  ADD COLUMN `feedback_by` VARCHAR(191) DEFAULT NULL,
  ADD KEY `idx_tv_feedback` (`feedback`);
