-- Seed the built-in RBAC permissions so database-backed authorization matches
-- the existing hardcoded role map and the admin role editor can manage them.

INSERT INTO role_permission (role_id, permission_code, created_by)
SELECT r.role_id, p.permission_code, 'V013'
FROM role r
CROSS JOIN (VALUES
  ('foundation:read'),
  ('integration:import'),
  ('serial:validate'),
  ('dispatch:write'),
  ('grn:write'),
  ('srn:write'),
  ('fulfilment:read'),
  ('ageing:read'),
  ('reconciliation:read'),
  ('serial-history:read'),
  ('exception:read'),
  ('exception:correct'),
  ('battery:write'),
  ('battery:read'),
  ('admin:access')
) AS p(permission_code)
WHERE r.code = 'admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;

INSERT INTO role_permission (role_id, permission_code, created_by)
SELECT r.role_id, p.permission_code, 'V013'
FROM role r
CROSS JOIN (VALUES
  ('foundation:read'),
  ('serial:validate'),
  ('dispatch:write'),
  ('grn:write'),
  ('srn:write'),
  ('fulfilment:read'),
  ('ageing:read'),
  ('reconciliation:read'),
  ('serial-history:read'),
  ('exception:read'),
  ('exception:correct'),
  ('battery:write'),
  ('battery:read')
) AS p(permission_code)
WHERE r.code = 'supervisor'
ON CONFLICT (role_id, permission_code) DO NOTHING;

INSERT INTO role_permission (role_id, permission_code, created_by)
SELECT r.role_id, p.permission_code, 'V013'
FROM role r
CROSS JOIN (VALUES
  ('foundation:read'),
  ('serial:validate'),
  ('dispatch:write'),
  ('grn:write'),
  ('srn:write'),
  ('fulfilment:read'),
  ('exception:read'),
  ('battery:write'),
  ('battery:read')
) AS p(permission_code)
WHERE r.code = 'warehouse_operator'
ON CONFLICT (role_id, permission_code) DO NOTHING;
