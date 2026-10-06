-- Provider Admin RBAC — run against the sp3digital_identity database
-- (copy into identity-admin-service's database/seeds/).
--
-- Grants:
--   TENANT_ADMIN: create + read + update  (registers and manages providers
--                 and their organization/facility affiliations)
--   TENANT_USER:  read only
--
-- Permission codes must match src/utils/permissions.js in
-- sp3digital-provider-admin-service exactly.

INSERT INTO permissions (permission_uuid, permission_code, permission_name, resource, action, description, status, created_on, modified_on)
SELECT UUID(), 'provider-admin:provider:create', 'Register provider', 'provider-admin', 'create',
       'Register a doctor/provider and add organization or facility affiliations', 'ACTIVE', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE permission_code = 'provider-admin:provider:create');

INSERT INTO permissions (permission_uuid, permission_code, permission_name, resource, action, description, status, created_on, modified_on)
SELECT UUID(), 'provider-admin:provider:read', 'View providers', 'provider-admin', 'read',
       'List and view providers and their affiliations', 'ACTIVE', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE permission_code = 'provider-admin:provider:read');

INSERT INTO permissions (permission_uuid, permission_code, permission_name, resource, action, description, status, created_on, modified_on)
SELECT UUID(), 'provider-admin:provider:update', 'Edit providers', 'provider-admin', 'update',
       'Edit a provider, change status, verify, and manage affiliations', 'ACTIVE', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE permission_code = 'provider-admin:provider:update');

-- TENANT_ADMIN: all three
INSERT INTO role_permissions (role_id, permission_id, status, created_on, modified_on)
SELECT roles.role_id, permissions.permission_id, 'ACTIVE', NOW(), NOW()
FROM roles
JOIN permissions ON permissions.permission_code IN (
  'provider-admin:provider:create',
  'provider-admin:provider:read',
  'provider-admin:provider:update'
)
LEFT JOIN role_permissions
  ON role_permissions.role_id = roles.role_id
  AND role_permissions.permission_id = permissions.permission_id
  AND role_permissions.status = 'ACTIVE'
WHERE roles.role_code = 'TENANT_ADMIN'
  AND role_permissions.role_permission_id IS NULL;

-- TENANT_USER: read only
INSERT INTO role_permissions (role_id, permission_id, status, created_on, modified_on)
SELECT roles.role_id, permissions.permission_id, 'ACTIVE', NOW(), NOW()
FROM roles
JOIN permissions ON permissions.permission_code = 'provider-admin:provider:read'
LEFT JOIN role_permissions
  ON role_permissions.role_id = roles.role_id
  AND role_permissions.permission_id = permissions.permission_id
  AND role_permissions.status = 'ACTIVE'
WHERE roles.role_code = 'TENANT_USER'
  AND role_permissions.role_permission_id IS NULL;
