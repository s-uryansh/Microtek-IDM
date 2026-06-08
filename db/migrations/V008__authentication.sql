ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS auth_session (
    auth_session_id BIGSERIAL PRIMARY KEY,
    session_id_hash VARCHAR(128) NOT NULL UNIQUE,
    app_user_id BIGINT NOT NULL REFERENCES app_user(app_user_id),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    ip_address VARCHAR(80),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_auth_session_user ON auth_session(app_user_id);
CREATE INDEX IF NOT EXISTS ix_auth_session_active ON auth_session(session_id_hash, expires_at) WHERE revoked_at IS NULL;

WITH admin_role AS (
  SELECT role_id FROM role WHERE code = 'admin'
),
admin_user AS (
  INSERT INTO app_user (
    external_ref,
    username,
    display_name,
    password_hash,
    role_id,
    is_active,
    created_by,
    updated_at,
    updated_by
  )
  SELECT
    'DEV-ADMIN',
    'admin',
    'Development Administrator',
    '$2b$12$tPMbnZMIwpdRNkm6EBsNpu6eYbK0E5ivwJAF.zCDdlGkwtNaRd/F6',
    admin_role.role_id,
    TRUE,
    'V008',
    now(),
    'V008'
  FROM admin_role
  ON CONFLICT (username) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      role_id = EXCLUDED.role_id,
      is_active = TRUE,
      updated_at = now(),
      updated_by = 'V008'
  RETURNING app_user_id
)
INSERT INTO app_user_warehouse (app_user_id, warehouse_id, created_by)
SELECT admin_user.app_user_id, warehouse.warehouse_id, 'V008'
FROM admin_user
CROSS JOIN warehouse
WHERE warehouse.is_active = TRUE
ON CONFLICT (app_user_id, warehouse_id) DO NOTHING;
