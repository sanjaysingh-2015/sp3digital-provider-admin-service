const axios = require('axios');
const { httpError } = require('../utils/errors');

let warnedUnconfigured = false;

function baseUrl() {
  return (process.env.ORGANIZATION_SERVICE_URL || '').replace(/\/+$/, '');
}

async function fetchOne(path, token, label) {
  try {
    const response = await axios.get(`${baseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000,
    });
    return response.data;
  } catch (error) {
    // organization-admin-service scopes every lookup to the token's tenant,
    // so a 404 means "does not exist, or belongs to another tenant".
    if (error.response?.status === 404) {
      throw httpError(400, 'INVALID_REFERENCE', `${label} does not exist in this tenant`);
    }
    throw httpError(502, 'ORGANIZATION_SERVICE_UNAVAILABLE', `Could not verify the ${label.toLowerCase()} with organization-admin-service`);
  }
}

/**
 * Confirms every organization / facility / department / facility-service id on
 * an affiliation exists in the caller's tenant AND that they hang together
 * (facility belongs to the organization, department and services belong to
 * the facility). Without this, a tenant admin could attach a provider to
 * another tenant's facility just by guessing ids.
 *
 * It forwards the caller's own bearer token, so tenant scoping is enforced by
 * the organization service itself. Skipped (with a one-time warning) when
 * ORGANIZATION_SERVICE_URL is unset or the caller is an internal service with
 * no user token — fine for local dev and tests, not for production.
 */
async function validateReferences({ token, organizationId, facilityId, departmentId, facilityServiceIds = [] }) {
  if (!baseUrl() || !token) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn('[provider-service] ORGANIZATION_SERVICE_URL is not set: organization/facility ids are NOT being verified.');
    }
    return;
  }

  await fetchOne(`/organizations/${organizationId}`, token, 'Organization');

  if (facilityId) {
    const facility = await fetchOne(`/facilities/${facilityId}`, token, 'Facility');
    if (Number(facility.organizationId) !== Number(organizationId)) {
      throw httpError(400, 'INVALID_REFERENCE', 'The facility does not belong to the given organization');
    }
  }

  if (departmentId) {
    const department = await fetchOne(`/departments/${departmentId}`, token, 'Department');
    if (Number(department.facilityId) !== Number(facilityId)) {
      throw httpError(400, 'INVALID_REFERENCE', 'The department does not belong to the given facility');
    }
  }

  for (const facilityServiceId of facilityServiceIds) {
    const facilityService = await fetchOne(`/facility-services/${facilityServiceId}`, token, `Facility service ${facilityServiceId}`);
    if (Number(facilityService.facilityId) !== Number(facilityId)) {
      throw httpError(400, 'INVALID_REFERENCE', `Facility service ${facilityServiceId} does not belong to the given facility`);
    }
  }
}

module.exports = { validateReferences };
