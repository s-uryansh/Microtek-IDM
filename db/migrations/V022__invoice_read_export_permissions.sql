-- Add invoice-specific read/export permissions so invoice access can be granted
-- without exposing the rest of the admin master-data panel.

INSERT INTO role_permission (role_id, permission_code, created_by)
SELECT r.role_id, p.permission_code, 'V022'
FROM role r
CROSS JOIN (VALUES
  ('invoice:read'),
  ('invoice:export')
) AS p(permission_code)
WHERE r.code = 'admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;
