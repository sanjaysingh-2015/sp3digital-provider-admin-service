/**
 * Fine-grained permission codes for the provider registry.
 *
 * Must match what identity-admin-service seeds — see
 * database/seeds/identity-admin-provider-rbac.sql in this repo:
 *
 *   TENANT_ADMIN: CREATE, READ, UPDATE  (registers and manages providers)
 *   TENANT_USER:  READ                  (can look providers up, nothing else)
 *
 * A caller whose token carries ALL_PERMISSIONS (SUPERADMIN) or the
 * 'provider-admin:*' wildcard bypasses these — see authorize() in
 * middleware/authentication.js.
 */
const PROVIDER_PERMISSIONS = {
  CREATE: 'provider-admin:provider:create',
  READ: 'provider-admin:provider:read',
  UPDATE: 'provider-admin:provider:update',
};

module.exports = { PROVIDER_PERMISSIONS };
