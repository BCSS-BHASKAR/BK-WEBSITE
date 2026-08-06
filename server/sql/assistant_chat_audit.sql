-- Persistent audit log for /assistant and /assistant_enhance interactions.
-- Apply: mysql -u root aiserver < server/sql/assistant_chat_audit.sql

CREATE TABLE IF NOT EXISTS assistant_chat_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id VARCHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  username VARCHAR(255) NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(64) NOT NULL,
  route ENUM('assistant', 'assistant_enhance') NOT NULL,
  question TEXT NOT NULL,
  answer MEDIUMTEXT NULL,
  objective VARCHAR(128) NULL,
  metric VARCHAR(128) NULL,
  generated_sql MEDIUMTEXT NULL,
  planner_context_json JSON NULL,
  entities_json JSON NULL,
  analytics_json JSON NULL,
  latency_ms INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_assistant_audit_user_id (user_id),
  KEY idx_assistant_audit_session_id (session_id),
  KEY idx_assistant_audit_route (route),
  KEY idx_assistant_audit_created_at (created_at),
  KEY idx_assistant_audit_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
