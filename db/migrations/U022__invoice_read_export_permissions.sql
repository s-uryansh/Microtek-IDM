DELETE FROM role_permission
WHERE permission_code IN ('invoice:read', 'invoice:export')
  AND created_by = 'V022';
