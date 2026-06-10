DELETE FROM role_permission
WHERE role_id IN (
  SELECT role_id FROM role WHERE code IN ('admin', 'supervisor', 'warehouse_operator')
)
AND permission_code IN (
  'foundation:read',
  'integration:import',
  'serial:validate',
  'dispatch:write',
  'grn:write',
  'srn:write',
  'fulfilment:read',
  'ageing:read',
  'reconciliation:read',
  'serial-history:read',
  'exception:read',
  'exception:correct',
  'battery:write',
  'battery:read',
  'admin:access'
);
