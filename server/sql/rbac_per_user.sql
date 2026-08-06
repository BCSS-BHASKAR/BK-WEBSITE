-- ---------------------------------------------------------------------------
-- Simplify RBAC: two roles, per-user page access.
--
-- Apply: psql -U aiserver -d aiserver -f server/sql/rbac_per_user.sql
-- Safe to re-run. Supersedes the role-matrix model in rbac.sql.
--
-- Model
--   role 'admin' -> every page, implicitly. Nothing to tick, cannot be reduced.
--   role 'user'  -> exactly the pages ticked for THAT user when it is created.
--
-- Access is therefore chosen per person at the moment the account is made,
-- rather than by maintaining a set of role tiers.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_page_permission (
  user_id    BIGINT       NOT NULL REFERENCES anpr_app_users(id) ON DELETE CASCADE,
  page_key   VARCHAR(64)  NOT NULL,
  granted_by VARCHAR(255) NULL,
  granted_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, page_key)
);
CREATE INDEX IF NOT EXISTS idx_upp_user ON user_page_permission (user_id);

-- Carry existing users over from the role matrix so nobody loses access in the
-- switch: whatever their old role could reach becomes their personal grant.
INSERT INTO user_page_permission (user_id, page_key, granted_by)
SELECT u.id, p.page_key, 'migration'
  FROM anpr_app_users u
  JOIN role_page_permission p ON p.role = u.role
 WHERE u.role <> 'admin'
ON CONFLICT DO NOTHING;

-- Collapse to two roles. Anyone who is not an administrator becomes 'user';
-- their individual page grants above decide what they actually see.
INSERT INTO app_role (role, label, description, is_builtin) VALUES
  ('user', 'User', 'Access limited to the pages selected on their account.', true)
ON CONFLICT (role) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_builtin = true;

UPDATE anpr_app_users SET role = 'user' WHERE role <> 'admin';

-- Drop the tiers that are no longer part of the model. app_role keeps only the
-- two the app now recognises.
DELETE FROM role_page_permission WHERE role NOT IN ('admin', 'user');
DELETE FROM app_role            WHERE role NOT IN ('admin', 'user');

UPDATE app_role
   SET label = 'Administrator',
       description = 'Full access to every page, including user administration.',
       is_builtin = true
 WHERE role = 'admin';
