-- ---------------------------------------------------------------------------
-- Local development bootstrap for the ANPR stack.
--
-- Creates every table the Express API reads from and fills it with synthetic
-- demo data so the dashboard, reports, violations and watchlist screens have
-- something to render without a live receiver pipeline.
--
-- Apply:  mysql -u root -p aiserver < server/sql/dev_bootstrap.sql
--
-- IMPORTANT: run this BEFORE starting the API. src/lib/dbMigrations.js installs
-- BEFORE INSERT triggers on `walkins` and `crowds` that overwrite trigger_date,
-- which would flatten the seeded history into "now". To re-seed later, drop
-- walkins_set_trigger_date / crowds_set_trigger_date first.
--
-- Time semantics (see src/eventTimeSql.js + config/site.config.json):
--   vehicle_events.created_at   -> stored as DB wall clock (+05:30), shown +08:00
--   walkins/crowds.trigger_date -> already stored in site time (+08:00)
-- So the MySQL server must run with default-time-zone='+05:30'.
-- ---------------------------------------------------------------------------

SET FOREIGN_KEY_CHECKS = 0;
SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION';

-- --------------------------------------------------------------------------
-- Schema
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sites (
  id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Native app users (primary login source).
CREATE TABLE IF NOT EXISTS anpr_app_users (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email                VARCHAR(255) NOT NULL,
  password_hash        VARCHAR(255) NOT NULL,
  role                 VARCHAR(64)  NOT NULL DEFAULT 'viewer',
  must_change_password TINYINT(1)   NOT NULL DEFAULT 0,
  token_version        INT          NOT NULL DEFAULT 0,
  locked_until         DATETIME     NULL,
  disabled_at          DATETIME     NULL,
  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_anpr_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Legacy Laravel user table; routes/auth.js falls back to it on a miss.
CREATE TABLE IF NOT EXISTS users (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email     VARCHAR(255) NOT NULL,
  password  VARCHAR(255) NULL,
  role_name VARCHAR(64)  NULL,
  status    VARCHAR(32)  NOT NULL DEFAULT 'active',
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vehicle_events (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id              VARCHAR(64)  NOT NULL,
  camera_id             VARCHAR(100) NOT NULL,
  vehicle_num           VARCHAR(32)  NULL,
  vehicle_num_raw       VARCHAR(32)  NULL,
  vehicle_category      INT          NULL,
  vehicle_type          VARCHAR(32)  NULL,
  ocr_confidence        DECIMAL(6,2) NULL,
  plate_read_trust      VARCHAR(16)  NULL,
  plate_read_risk_flags JSON         NULL,
  plate_read_metrics    JSON         NULL,
  `timestamp`           BIGINT       NOT NULL DEFAULT 0,
  full_image_url        VARCHAR(512) NULL,
  plate_url             VARCHAR(512) NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ve_event_id (event_id),
  KEY idx_ve_created_at (created_at),
  KEY idx_ve_camera (camera_id),
  KEY idx_ve_plate (vehicle_num)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS traffic_violations (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id       VARCHAR(64)  NOT NULL,
  violation_type VARCHAR(64)  NOT NULL,
  score          DECIMAL(6,3) NULL,
  feedback       TINYINT      DEFAULT NULL COMMENT 'NULL=unrated,1=confirmed,0=false_positive',
  feedback_at    DATETIME     DEFAULT NULL,
  feedback_by    VARCHAR(191) DEFAULT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tv_event_id (event_id),
  KEY idx_tv_type (violation_type),
  KEY idx_tv_feedback (feedback)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per violation that has been actioned (challan issued or dismissed).
CREATE TABLE IF NOT EXISTS violation_ticket_flags (
  violation_id BIGINT UNSIGNED NOT NULL,
  flag         TINYINT     NOT NULL DEFAULT 0 COMMENT '1=challan generated, 0=invalid',
  challan_id   VARCHAR(64) NULL,
  created_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (violation_id),
  KEY idx_vtf_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS walkins (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  site_id      INT UNSIGNED NOT NULL DEFAULT 1,
  camera_id    VARCHAR(100) NOT NULL,
  gender       ENUM('male','female','unknown') NOT NULL DEFAULT 'unknown',
  image_path   VARCHAR(512) NULL,
  trigger_date DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_walkins_trigger (trigger_date),
  KEY idx_walkins_camera (camera_id),
  KEY idx_walkins_gender (gender)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crowds (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  site_id       INT UNSIGNED NOT NULL DEFAULT 1,
  site_name     VARCHAR(255) NULL,
  camera_id     VARCHAR(100) NOT NULL,
  alert_type    ENUM('intrusion','unauthorized_access','camera_tampering','unattended_kitchen','understaffed_kitchen') NOT NULL DEFAULT 'intrusion',
  people_count  INT          NOT NULL DEFAULT 0,
  occupancy_pct DECIMAL(6,2) NOT NULL DEFAULT 0,
  image_path    VARCHAR(512) NULL,
  trigger_date  DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_crowds_trigger (trigger_date),
  KEY idx_crowds_camera (camera_id),
  KEY idx_crowds_alert_type (alert_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Watchlist model. lpr_vehicle_lists stores unix seconds in created_at/updated_at
-- (routes/watchlist.js writes Math.floor(Date.now()/1000)); lpr_rules uses NOW().
CREATE TABLE IF NOT EXISTS lpr_vehicle_lists (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  enabled    TINYINT(1)   NOT NULL DEFAULT 1,
  name       VARCHAR(255) NOT NULL,
  notes      TEXT         NULL,
  site_id    INT UNSIGNED NOT NULL DEFAULT 1,
  created_at BIGINT       NULL,
  updated_at BIGINT       NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lpr_vehicle_list_vehicles (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  vehicle_list_id INT UNSIGNED NOT NULL,
  conditions      TEXT     NULL,
  created_at      DATETIME NULL,
  updated_at      DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_lvlv_list (vehicle_list_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lpr_rules (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  enabled        TINYINT(1)   NOT NULL DEFAULT 1,
  barrierOpen    TINYINT(1)   NOT NULL DEFAULT 0,
  filterType     VARCHAR(32)  NOT NULL DEFAULT 'plate',
  vehicleListIds TEXT         NULL,
  name           VARCHAR(255) NOT NULL,
  access_type    VARCHAR(64)  NULL,
  security_type  VARCHAR(64)  NULL,
  priority       INT          NOT NULL DEFAULT 10,
  site_id        INT UNSIGNED NOT NULL DEFAULT 1,
  conditions     TEXT         NULL,
  notes          TEXT         NULL,
  valid_from     DATETIME     NULL,
  valid_to       DATETIME     NULL,
  created_at     DATETIME     NULL,
  updated_at     DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_rules_site (site_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Optional legacy tables the watchlist "hits" endpoint probes for.
CREATE TABLE IF NOT EXISTS events (
  id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id VARCHAR(64) NOT NULL,
  lp       VARCHAR(32) NULL,
  PRIMARY KEY (id),
  KEY idx_events_event_id (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rule_event_triggers (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rule_id      INT UNSIGNED NULL,
  event_id     VARCHAR(64)  NULL,
  trigger_date DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_ret_trigger (trigger_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Also created at boot by src/lib/dbMigrations.js; declared here so a fresh
-- bootstrap is complete on its own.
CREATE TABLE IF NOT EXISTS camera_alert_status (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  camera_id        VARCHAR(100) NOT NULL,
  camera_name      VARCHAR(255) NOT NULL,
  status           ENUM('online','offline') NOT NULL DEFAULT 'offline',
  last_seen_online DATETIME NULL,
  offline_since    DATETIME NULL,
  alert_sent_at    DATETIME NULL,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_camera_id (camera_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS assistant_chat_audit (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id           VARCHAR(64)  NOT NULL,
  user_id              BIGINT UNSIGNED NOT NULL,
  username             VARCHAR(255) NULL,
  email                VARCHAR(255) NOT NULL,
  role                 VARCHAR(64)  NOT NULL,
  route                ENUM('assistant','assistant_enhance') NOT NULL,
  question             TEXT         NOT NULL,
  answer               MEDIUMTEXT   NULL,
  objective            VARCHAR(128) NULL,
  metric               VARCHAR(128) NULL,
  generated_sql        MEDIUMTEXT   NULL,
  planner_context_json JSON         NULL,
  entities_json        JSON         NULL,
  analytics_json       JSON         NULL,
  latency_ms           INT UNSIGNED NULL,
  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_assistant_audit_user_id (user_id),
  KEY idx_assistant_audit_session_id (session_id),
  KEY idx_assistant_audit_route (route),
  KEY idx_assistant_audit_created_at (created_at),
  KEY idx_assistant_audit_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- Reference data
-- --------------------------------------------------------------------------

INSERT INTO sites (id, name) VALUES
  (1, 'Biryani Katha'),
  (2, 'Biryani Katha - Banquet')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- admin@anpr.local  / Admin@123
-- viewer@anpr.local / Viewer@123
INSERT INTO anpr_app_users (email, password_hash, role, must_change_password) VALUES
  ('admin@anpr.local',  '$2b$10$uj7Lffbyp5Hs3Z9rRsiv1ech8Y38lYCQ./inpYrJzFRWXgdY537hC', 'admin',  0),
  ('viewer@anpr.local', '$2b$10$D7PymnEEHz/QoPUnINTcuetWdyE0wQ0RNz.H2szDRE58eSWz7EK7W', 'viewer', 0)
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role);

-- --------------------------------------------------------------------------
-- Number generator used by the seed blocks below (0 .. 9999)
-- --------------------------------------------------------------------------

DROP TABLE IF EXISTS _seed_seq;
DROP TABLE IF EXISTS _seed_digits;

CREATE TABLE _seed_digits (d INT NOT NULL);
INSERT INTO _seed_digits (d) VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9);

CREATE TABLE _seed_seq (n INT NOT NULL PRIMARY KEY);
INSERT INTO _seed_seq (n)
SELECT a.d + b.d * 10 + c.d * 100 + e.d * 1000
FROM _seed_digits a, _seed_digits b, _seed_digits c, _seed_digits e;

-- --------------------------------------------------------------------------
-- vehicle_events: ~4500 plate reads spread over the last 30 days
-- --------------------------------------------------------------------------

TRUNCATE TABLE vehicle_events;

INSERT INTO vehicle_events
  (event_id, camera_id, vehicle_num, vehicle_num_raw, vehicle_category, vehicle_type,
   ocr_confidence, plate_read_trust, plate_read_risk_flags, plate_read_metrics,
   `timestamp`, full_image_url, plate_url, created_at)
SELECT
  CONCAT('EV', LPAD(t.n, 8, '0')),
  t.cam,
  -- Plate is a pure function of t.idx, so both columns get the same value.
  CONCAT(CHAR(65 + (t.idx * 7) % 26 USING utf8mb4),
         CHAR(65 + (t.idx * 13) % 26 USING utf8mb4),
         CHAR(65 + (t.idx * 3) % 26 USING utf8mb4),
         ' ', LPAD((t.idx * 23) % 10000, 4, '0')),
  CONCAT(CHAR(65 + (t.idx * 7) % 26 USING utf8mb4),
         CHAR(65 + (t.idx * 13) % 26 USING utf8mb4),
         CHAR(65 + (t.idx * 3) % 26 USING utf8mb4),
         ' ', LPAD((t.idx * 23) % 10000, 4, '0')),
  t.cat,
  t.vtype,
  t.conf,
  t.trust,
  CASE t.trust
    WHEN 'low'    THEN JSON_ARRAY('low_ocr_conf')
    WHEN 'medium' THEN JSON_ARRAY('medium_ocr_conf')
    ELSE JSON_ARRAY()
  END,
  JSON_OBJECT(
    'trust', t.trust,
    'ocr_confidence', t.conf,
    'quality_band', CASE t.trust WHEN 'high' THEN 'excellent' WHEN 'medium' THEN 'good' ELSE 'fair' END,
    'readable_crop', t.trust <> 'low',
    'factors', JSON_ARRAY(CONCAT('Plate crop sharpness score: ', ROUND(t.conf / 100, 2)))
  ),
  0,
  CONCAT('receiver-results/', t.cam, '/scene/', LPAD(t.n, 8, '0'), '.jpg'),
  CONCAT('receiver-results/', t.cam, '/plate/', LPAD(t.n, 8, '0'), '.jpg'),
  -- Roll back a day if the randomised clock landed in the future.
  IF(t.ts > NOW(), t.ts - INTERVAL 1 DAY, t.ts)
FROM (
  SELECT
    s.n,
    ELT(FLOOR(RAND() * 4) + 1, 'AEYE_2', 'AEYE_4', 'AEYE_5', 'AEYE_6') AS cam,
    -- ~420 recurring plates so top-plates / journey screens have real repeats
    FLOOR(RAND() * 420) AS idx,
    FLOOR(RAND() * 12) + 1 AS cat,
    ELT(FLOOR(RAND() * 10) + 1,
        'PRIVATE','PRIVATE','PRIVATE','PRIVATE','PRIVATE',
        'PUBLIC_UTILITY','PUBLIC_UTILITY','PUBLIC_UTILITY','ELECTRIC','PRIVATE') AS vtype,
    ROUND(55 + RAND() * 44, 2) AS conf,
    ELT(FLOOR(RAND() * 10) + 1,
        'high','high','high','high','high','high','medium','medium','medium','low') AS trust,
    TIMESTAMP(
      DATE_SUB(CURDATE(), INTERVAL FLOOR(RAND() * 30) DAY),
      -- Diurnal shape: busiest between 07:00 and 20:00
      MAKETIME(LEAST(23, FLOOR(5 + 18 * POW(RAND(), 0.85))), FLOOR(RAND() * 60), FLOOR(RAND() * 60))
    ) AS ts
  FROM _seed_seq s
  WHERE s.n < 4500
) t;

-- Mirror plates into the legacy `events` table used by watchlist hits.
TRUNCATE TABLE events;
INSERT INTO events (event_id, lp)
SELECT event_id, vehicle_num FROM vehicle_events;

-- --------------------------------------------------------------------------
-- traffic_violations: ~7% of reads, weighted toward two-wheeler offences
-- --------------------------------------------------------------------------

TRUNCATE TABLE traffic_violations;

INSERT INTO traffic_violations (event_id, violation_type, score, feedback, created_at)
SELECT
  ve.event_id,
  ELT(FLOOR(RAND() * 8) + 1,
      'NO_HELMET','NO_HELMET','NO_HELMET',
      'TRIPLE_RIDING','TRIPLE_RIDING',
      'WRONG_ROUTE','WRONG_ROUTE',
      'WRONG_PARKING'),
  ROUND(0.55 + RAND() * 0.44, 3),
  -- Mostly unrated; a few thumbs-up, a couple flagged as false positives
  ELT(FLOOR(RAND() * 12) + 1, NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1,1,0),
  ve.created_at
FROM vehicle_events ve
WHERE RAND() < 0.07;

-- Mark a slice of violations as already actioned so challan history and the
-- "pending review" counters are not empty.
TRUNCATE TABLE violation_ticket_flags;

INSERT INTO violation_ticket_flags (violation_id, flag, challan_id, created_at, updated_at)
SELECT
  tv.id,
  IF(RAND() < 0.8, 1, 0),
  CONCAT('CHL-', DATE_FORMAT(CURDATE(), '%Y%m'), '-', LPAD(tv.id, 6, '0')),
  tv.created_at,
  tv.created_at
FROM traffic_violations tv
WHERE RAND() < 0.25;

-- --------------------------------------------------------------------------
-- walkins / crowds
--
-- trigger_date is stored in SITE time (+08:00), unlike vehicle_events.created_at.
-- --------------------------------------------------------------------------

SET @site_now   := CONVERT_TZ(NOW(), '+05:30', '+08:00');
SET @site_today := DATE(@site_now);

TRUNCATE TABLE walkins;

INSERT INTO walkins (site_id, camera_id, gender, image_path, trigger_date)
SELECT
  1,
  'Right Entrance',
  t.gender,
  CONCAT('walkins/', DATE_FORMAT(t.ts, '%Y-%m-%d'), '/frame_', LPAD(t.n, 6, '0'), '.jpg'),
  IF(t.ts > @site_now, t.ts - INTERVAL 1 DAY, t.ts)
FROM (
  SELECT
    s.n,
    -- Roughly 55% male, 40% female, 5% not classified
    ELT(FLOOR(RAND() * 20) + 1,
        'male','male','male','male','male','male','male','male','male','male','male',
        'female','female','female','female','female','female','female',
        'unknown','unknown') AS gender,
    TIMESTAMP(
      DATE_SUB(@site_today, INTERVAL FLOOR(RAND() * 30) DAY),
      -- Office footfall: 08:00 - 17:00
      MAKETIME(FLOOR(8 + RAND() * 9), FLOOR(RAND() * 60), FLOOR(RAND() * 60))
    ) AS ts
  FROM _seed_seq s
  WHERE s.n < 900
) t;

TRUNCATE TABLE crowds;

INSERT INTO crowds (site_id, site_name, camera_id, alert_type, people_count, occupancy_pct, image_path, trigger_date)
SELECT
  1,
  'Biryani Katha',
  'Overview',
  t.alert_type,
  t.people,
  -- severityAlarm 70 / severityCritical 85 per config/site.config.json
  LEAST(100, ROUND(t.people * 1.45, 2)),
  CONCAT('crowds/', DATE_FORMAT(t.ts, '%Y-%m-%d'), '/frame_', LPAD(t.n, 6, '0'), '.jpg'),
  IF(t.ts > @site_now, t.ts - INTERVAL 1 DAY, t.ts)
FROM (
  SELECT
    s.n,
    FLOOR(28 + RAND() * 40) AS people,
    -- Roughly 35% intrusion, 15% unauthorized, 15% tampering, 15% unattended,
    -- 20% understaffed
    ELT(FLOOR(RAND() * 20) + 1,
        'intrusion','intrusion','intrusion','intrusion','intrusion','intrusion','intrusion',
        'unauthorized_access','unauthorized_access','unauthorized_access',
        'camera_tampering','camera_tampering','camera_tampering',
        'unattended_kitchen','unattended_kitchen','unattended_kitchen',
        'understaffed_kitchen','understaffed_kitchen','understaffed_kitchen','understaffed_kitchen') AS alert_type,
    TIMESTAMP(
      DATE_SUB(@site_today, INTERVAL FLOOR(RAND() * 30) DAY),
      MAKETIME(FLOOR(8 + RAND() * 10), FLOOR(RAND() * 60), FLOOR(RAND() * 60))
    ) AS ts
  FROM _seed_seq s
  WHERE s.n < 620
) t;

-- --------------------------------------------------------------------------
-- Watchlists: two lists plus matching rules, seeded from plates that actually
-- appear in the reads so the watchlist hit panel resolves against vehicle_events.
-- --------------------------------------------------------------------------

TRUNCATE TABLE lpr_vehicle_list_vehicles;
TRUNCATE TABLE lpr_vehicle_lists;
TRUNCATE TABLE lpr_rules;
TRUNCATE TABLE rule_event_triggers;

INSERT INTO lpr_vehicle_lists (id, enabled, name, notes, site_id, created_at, updated_at) VALUES
  (1, 1, 'Stolen Vehicles', 'Plates reported stolen to the station desk.', 1, UNIX_TIMESTAMP(), UNIX_TIMESTAMP()),
  (2, 1, 'VIP Convoy',      'Cleared for barrier-free entry.',            1, UNIX_TIMESTAMP(), UNIX_TIMESTAMP());

INSERT INTO lpr_vehicle_list_vehicles (vehicle_list_id, conditions, created_at, updated_at)
SELECT
  IF(x.rn <= 8, 1, 2),
  JSON_ARRAY(JSON_OBJECT('lp', JSON_OBJECT('eq', x.vehicle_num))),
  NOW(),
  NOW()
FROM (
  SELECT vehicle_num, ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) AS rn
  FROM vehicle_events
  WHERE vehicle_num IS NOT NULL AND vehicle_num <> ''
  GROUP BY vehicle_num
  ORDER BY COUNT(*) DESC
  LIMIT 12
) x;

INSERT INTO lpr_rules
  (id, enabled, barrierOpen, filterType, vehicleListIds, name, access_type, security_type,
   priority, site_id, conditions, notes, valid_from, valid_to, created_at, updated_at)
VALUES
  (1, 1, 0, 'vehicleList', '["Stolen Vehicles"]', 'Stolen vehicle alert', 'deny', 'alarm', 5, 1,
   JSON_ARRAY(JSON_OBJECT('_cameras', JSON_OBJECT('ids', JSON_ARRAY('AEYE_2','AEYE_4','AEYE_5','AEYE_6')))),
   'Raise an alarm on any camera.', NULL, NULL, NOW(), NOW()),
  (2, 1, 1, 'vehicleList', '["VIP Convoy"]', 'VIP convoy pass', 'allow', 'notify', 20, 1,
   JSON_ARRAY(JSON_OBJECT('_cameras', JSON_OBJECT('ids', JSON_ARRAY('AEYE_6')))),
   'Bridge camera only.', NULL, NULL, NOW(), NOW());

-- Historic trigger rows so /watchlist/hits has data from the triggers source.
INSERT INTO rule_event_triggers (rule_id, event_id, trigger_date)
SELECT
  1,
  ve.event_id,
  CONVERT_TZ(ve.created_at, '+05:30', '+08:00')
FROM vehicle_events ve
JOIN lpr_vehicle_list_vehicles v
  ON v.vehicle_list_id = 1
 AND JSON_UNQUOTE(JSON_EXTRACT(v.conditions, '$[0].lp.eq')) = ve.vehicle_num
ORDER BY ve.created_at DESC
LIMIT 120;

-- --------------------------------------------------------------------------

DROP TABLE _seed_seq;
DROP TABLE _seed_digits;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'vehicle_events'     AS table_name, COUNT(*) AS rows_seeded FROM vehicle_events
UNION ALL SELECT 'traffic_violations',     COUNT(*) FROM traffic_violations
UNION ALL SELECT 'violation_ticket_flags', COUNT(*) FROM violation_ticket_flags
UNION ALL SELECT 'walkins',                COUNT(*) FROM walkins
UNION ALL SELECT 'crowds',                 COUNT(*) FROM crowds
UNION ALL SELECT 'rule_event_triggers',    COUNT(*) FROM rule_event_triggers
UNION ALL SELECT 'anpr_app_users',         COUNT(*) FROM anpr_app_users;
