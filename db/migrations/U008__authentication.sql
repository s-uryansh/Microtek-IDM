DROP TABLE IF EXISTS auth_session;

DELETE FROM app_user_warehouse
WHERE app_user_id IN (SELECT app_user_id FROM app_user WHERE username = 'admin')
  AND created_by = 'V008';

DELETE FROM app_user
WHERE username = 'admin'
  AND created_by = 'V008';

ALTER TABLE app_user
  DROP COLUMN IF EXISTS last_login_at,
  DROP COLUMN IF EXISTS locked_until,
  DROP COLUMN IF EXISTS failed_login_count,
  DROP COLUMN IF EXISTS password_hash;
