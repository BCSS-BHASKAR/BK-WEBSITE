-- ---------------------------------------------------------------------------
-- chef_absence: the fifth CV service.
--
-- Apply: psql -U aiserver -d aiserver -f server/sql/chef_absence.sql
-- Safe to re-run. Purely additive - touches no existing table.
--
-- Four artefact types arrive under uploads/chef_absence/:
--   unattended/<date>/<date>_<time>_<camera>.mp4   kitchen-empty clips
--   intrusions/<date>/<date>-<time>_<seq>.png      someone entered the kitchen
--   crops/<date>/face_live_<track>_<epoch>.jpg     person crops
--   results/<date>/detections.jsonl                per-person attributes
--
-- A NOTE ON CLIP DURATION
-- -----------------------
-- The service is documented as saving a clip only after the kitchen has been
-- empty for >= 60 s, which would make clip duration a usable proxy for absence
-- duration. It is not. Measured across all 151 clips in the bucket, 150 fall
-- BELOW that floor - median container duration is about 1 s, minimum 0.13 s.
--
-- The cause is in the writer, not the data: every clip is tagged 15 fps but
-- holds only the frames the detector loop actually emitted (2, 10, 15, 22 ...),
-- so duration collapses to frame_count / 15 and measures processing throughput
-- rather than wall-clock. Nothing in the JSONL carries a start/end or duration
-- either.
--
-- So the columns below record what was measured (frame_count, clip_seconds)
-- and are labelled as clip length in the UI. Absence duration is NOT derived
-- from them, and no KPI is built on them, until the writer emits a real end
-- timestamp. See docs/CHEF_ABSENCE_DURATION.md.
-- ---------------------------------------------------------------------------

-- One row per unattended clip = one absence incident.
CREATE TABLE IF NOT EXISTS chef_absence_incident (
  id           BIGSERIAL PRIMARY KEY,
  camera_key   VARCHAR(190) NOT NULL,
  started_at   TIMESTAMPTZ  NOT NULL,
  frame_count  INTEGER      NULL,
  clip_seconds NUMERIC(10,3) NULL,  -- container duration; see header note
  asset_id     BIGINT       NOT NULL REFERENCES media_asset(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_chef_absence_asset UNIQUE (asset_id)
);
CREATE INDEX IF NOT EXISTS idx_cai_started ON chef_absence_incident (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cai_camera  ON chef_absence_incident (camera_key, started_at DESC);

-- One row per intrusion snapshot. The filename carries no camera id, so
-- camera_key stays null unless a detection at the same instant supplies one.
CREATE TABLE IF NOT EXISTS kitchen_intrusion (
  id          BIGSERIAL PRIMARY KEY,
  camera_key  VARCHAR(190) NULL,
  occurred_at TIMESTAMPTZ  NOT NULL,
  daily_seq   INTEGER      NULL,
  asset_id    BIGINT       NOT NULL REFERENCES media_asset(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_kitchen_intrusion_asset UNIQUE (asset_id)
);
CREATE INDEX IF NOT EXISTS idx_ki_occurred ON kitchen_intrusion (occurred_at DESC);

-- One row per JSONL record: a person seen in the kitchen, classified.
--
-- status_chef is the field the business cares about - 'chef', 'non-chef' or
-- 'housekeeping'. cap_garment is null when no headwear was detected, which is
-- what drives the hygiene-compliance figure.
CREATE TABLE IF NOT EXISTS chef_detection (
  id                  BIGSERIAL PRIMARY KEY,
  camera_key          VARCHAR(190) NOT NULL,
  track_id            BIGINT       NOT NULL,
  raw_track_id        BIGINT       NULL,
  detected_at         TIMESTAMPTZ  NOT NULL,
  status_chef         VARCHAR(40)  NULL,
  bbox                JSONB        NULL,
  confidence          DOUBLE PRECISION NULL,
  upper_garment       VARCHAR(80)  NULL,
  lower_garment       VARCHAR(80)  NULL,
  cap_garment         VARCHAR(80)  NULL,
  face_quality        JSONB        NULL,
  identity_name       VARCHAR(190) NULL,
  identity_similarity DOUBLE PRECISION NULL,
  mode                VARCHAR(40)  NULL,
  crop_asset_id       BIGINT       NULL REFERENCES media_asset(id) ON DELETE SET NULL,
  frame_asset_id      BIGINT       NULL REFERENCES media_asset(id) ON DELETE SET NULL,
  source_key          TEXT         NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_chef_detection_natural UNIQUE (camera_key, track_id, detected_at)
);
CREATE INDEX IF NOT EXISTS idx_cd_detected ON chef_detection (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_cd_status   ON chef_detection (status_chef, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_cd_camera   ON chef_detection (camera_key, detected_at DESC);

-- Dominant colours per detection, per region. 'cap' joins the upper/lower pair
-- that walkins already uses.
CREATE TABLE IF NOT EXISTS chef_colour (
  id           BIGSERIAL PRIMARY KEY,
  detection_id BIGINT      NOT NULL REFERENCES chef_detection(id) ON DELETE CASCADE,
  region       VARCHAR(16) NOT NULL,
  name         VARCHAR(60) NOT NULL,
  percentage   NUMERIC(6,2) NULL,
  rgb          INTEGER[]   NULL
);
CREATE INDEX IF NOT EXISTS idx_cc_detection ON chef_colour (detection_id);
