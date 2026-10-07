const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

process.env.DB_DIALECT = 'sqlite';
process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'test-only-shared-secret';
process.env.ADMIN_JWT_AUDIENCE = process.env.ADMIN_JWT_AUDIENCE || 'sp3-provider-admin-test';
delete process.env.ORGANIZATION_SERVICE_URL; // reference checks are exercised in their own test below

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

const tokenFor = (tenantUuid, permissions, userId = 7) =>
  jwt.sign({ tenant_uuid: tenantUuid, user_id: userId, permissions }, process.env.ADMIN_JWT_SECRET, {
    audience: process.env.ADMIN_JWT_AUDIENCE,
    expiresIn: '5m',
  });

const ADMIN_PERMS = ['provider-admin:provider:create', 'provider-admin:provider:read', 'provider-admin:provider:update'];
const adminA = tokenFor(TENANT_A, ADMIN_PERMS);
const adminB = tokenFor(TENANT_B, ADMIN_PERMS);
const userA = tokenFor(TENANT_A, ['provider-admin:provider:read']);

let server;
let baseUrl;

test.before(async () => {
  const app = require('../src/app');
  const db = require('../src/models');
  await db.sequelize.sync({ force: true });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((resolve) => server.close(resolve)); });

async function call(method, path, { token, body } = {}) {
  const response = await fetch(`${baseUrl}/api/v1/provider-admin${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}

const doctor = (overrides = {}) => ({
  title: 'Dr.',
  firstName: 'Asha',
  lastName: 'Verma',
  gender: 'FEMALE',
  email: 'asha.verma@example.com',
  phoneCountryCode: '+91',
  phoneNumber: '9876543210',
  practiceStartDate: '2012-04-01',
  registrations: [{ registrationBody: 'NMC', registrationNumber: 'NMC-1001' }],
  qualifications: [{ degree: 'MBBS', university: 'AIIMS', yearOfCompletion: 2010 }, { degree: 'MD', specialization: 'Paediatrics', yearOfCompletion: 2014 }],
  specialties: [{ specialtyName: 'Paediatrics' }],
  languages: [{ languageName: 'Hindi' }, { languageName: 'English' }],
  ...overrides,
});

test('rejects requests with no bearer token', async () => {
  assert.equal((await call('GET', '/providers')).status, 401);
});

test('TENANT_USER can read but not register', async () => {
  assert.equal((await call('POST', '/providers', { token: userA, body: doctor() })).status, 403);
  assert.equal((await call('GET', '/providers', { token: userA })).status, 200);
});

let created;

test('registers a doctor in two organizations in one call', async () => {
  const { status, json } = await call('POST', '/providers', {
    token: adminA,
    body: doctor({
      affiliations: [
        { organizationId: 1, facilityId: 10, availabilityType: 'PHYSICAL', roomOrChamber: 'Room 4', consultationFee: 500, facilityServiceIds: [100, 101] },
        { organizationId: 2, availabilityType: 'REMOTE', remoteChannels: ['VIDEO', 'AUDIO'], consultationFee: 300 },
      ],
    }),
  });
  assert.equal(status, 201, JSON.stringify(json));
  created = json;
  assert.match(json.providerCode, /^PRV-\d{6}$/);
  assert.equal(json.displayName, 'Dr. Asha Verma');
  assert.equal(json.primarySpecialty, 'Paediatrics');
  assert.ok(json.experienceYears >= 13);
  assert.equal(json.verificationStatus, 'PENDING');
  assert.equal(json.registrations[0].isPrimary, true);
  assert.equal(json.qualifications.length, 2);
  assert.equal(json.affiliations.length, 2);
  const physical = json.affiliations.find((a) => a.availabilityType === 'PHYSICAL');
  const remote = json.affiliations.find((a) => a.availabilityType === 'REMOTE');
  assert.deepEqual(physical.facilityServiceIds.sort(), [100, 101]);
  assert.equal(physical.isPrimary, true);
  assert.equal(remote.isPrimary, false);
  assert.deepEqual(remote.remoteChannels, ['VIDEO', 'AUDIO']);
  assert.equal(remote.facilityId, null);
});

test('licensed provider types need a registration', async () => {
  const { status, json } = await call('POST', '/providers', { token: adminA, body: doctor({ registrations: [] }) });
  assert.equal(status, 400);
  assert.match(json.error.details[0], /registration/i);
});

test('the same registration number cannot be registered twice in a tenant, but can in another', async () => {
  const dup = await call('POST', '/providers', { token: adminA, body: doctor({ firstName: 'Other' }) });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.error.code, 'DUPLICATE_REGISTRATION');
  assert.match(dup.json.error.message, /PRV-/);
  assert.deepEqual(dup.json.error.details, [`existingProviderId=${created.providerId}`]);

  const otherTenant = await call('POST', '/providers', { token: adminB, body: doctor() });
  assert.equal(otherTenant.status, 201);
});

test('providers are invisible across tenants', async () => {
  assert.equal((await call('GET', `/providers/${created.providerId}`, { token: adminB })).status, 404);
  const list = await call('GET', '/providers?search=Verma', { token: adminB });
  assert.ok(list.json.data.every((p) => p.providerId !== created.providerId));
});

test('affiliation rules per availability type', async () => {
  const path = `/providers/${created.providerId}/affiliations`;
  const post = (body) => call('POST', path, { token: adminA, body });

  assert.equal((await post({ organizationId: 1, availabilityType: 'PHYSICAL' })).status, 400); // needs facility
  assert.equal((await post({ organizationId: 1, facilityId: 11, availabilityType: 'REMOTE' })).status, 400); // needs channels
  assert.equal((await post({ organizationId: 1, facilityId: 11, availabilityType: 'OTHER' })).status, 400); // needs subtype
  assert.equal((await post({ organizationId: 1, facilityId: 11, availabilityType: 'PHYSICAL', remoteChannels: ['VIDEO'] })).status, 400);
  assert.equal((await post({ organizationId: 1, availabilityType: 'REMOTE', remoteChannels: ['CHAT'], departmentId: 5 })).status, 400); // department needs facility
  assert.equal((await post({ organizationId: 1, facilityId: 11, availabilityType: 'PHYSICAL', effectiveFrom: '2026-05-01', effectiveTo: '2026-04-01' })).status, 400);

  // On-demand at a facility, and remote at the SAME facility as the physical one.
  const onDemand = await post({ organizationId: 1, facilityId: 12, availabilityType: 'OTHER', availabilitySubtype: 'ON_DEMAND', consultationFee: 800 });
  assert.equal(onDemand.status, 201, JSON.stringify(onDemand.json));
  assert.equal(onDemand.json.availabilitySubtype, 'ON_DEMAND');
  const remoteSameFacility = await post({ organizationId: 1, facilityId: 10, availabilityType: 'REMOTE', remoteChannels: ['VIDEO'] });
  assert.equal(remoteSameFacility.status, 201);

  const dup = await post({ organizationId: 1, facilityId: 10, availabilityType: 'REMOTE', remoteChannels: ['CHAT'] });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.error.code, 'DUPLICATE_AFFILIATION');
});

test('list filters: availability type, facility, search by registration number, specialty, hides DELETED', async () => {
  const q = (query) => call('GET', `/providers?${query}`, { token: adminA });

  const byType = await q('availabilityType=REMOTE');
  assert.ok(byType.json.data.some((p) => p.providerId === created.providerId));
  const row = byType.json.data.find((p) => p.providerId === created.providerId);
  assert.deepEqual(row.availabilityTypes.sort(), ['OTHER', 'PHYSICAL', 'REMOTE']);
  assert.equal(row.organizationCount, 2);
  assert.equal(row.registrationNumber, 'NMC NMC-1001');

  assert.equal((await q('facilityId=10')).json.data.length, 1);
  assert.equal((await q('facilityId=999')).json.data.length, 0);
  assert.equal((await q('search=NMC-1001')).json.data.length, 1);
  assert.equal((await q('specialty=paed')).json.data.length, 1);
  assert.equal((await q('specialty=paed&facilityId=999')).json.data.length, 0);

  const dropdown = await call('GET', '/providers/list?facilityId=10', { token: adminA });
  assert.equal(dropdown.json.data[0].displayName, 'Dr. Asha Verma');
});

test('PATCH replaces only the collections that are sent and re-derives the display name', async () => {
  const { status, json } = await call('PATCH', `/providers/${created.providerId}`, {
    token: adminA,
    body: { middleName: 'Kumari', languages: [{ languageName: 'Hindi' }], bio: 'Paediatrician with 13 years of practice.' },
  });
  assert.equal(status, 200, JSON.stringify(json));
  assert.equal(json.displayName, 'Dr. Asha Kumari Verma');
  assert.equal(json.languages.length, 1);
  assert.equal(json.qualifications.length, 2); // omitted -> untouched
  assert.equal(json.registrations.length, 1);

  const clearReg = await call('PATCH', `/providers/${created.providerId}`, { token: adminA, body: { registrations: [] } });
  assert.equal(clearReg.status, 400); // a doctor can't end up with no registration
});

test('verify and status changes', async () => {
  const verified = await call('POST', `/providers/${created.providerId}/verify`, { token: adminA, body: { verificationStatus: 'VERIFIED', remarks: 'Certificates checked' } });
  assert.equal(verified.status, 200);
  assert.equal(verified.json.verificationStatus, 'VERIFIED');
  assert.equal(verified.json.verifiedBy, 7);
  assert.ok(verified.json.verifiedOn);

  assert.equal((await call('POST', `/providers/${created.providerId}/verify`, { token: userA, body: { verificationStatus: 'VERIFIED' } })).status, 403);

  const suspended = await call('PATCH', `/providers/${created.providerId}/status`, { token: adminA, body: { status: 'SUSPENDED' } });
  assert.equal(suspended.json.status, 'SUSPENDED');
  await call('PATCH', `/providers/${created.providerId}/status`, { token: adminA, body: { status: 'ACTIVE' } });
});

test('editing an affiliation: type switch clears stale fields, primary moves, ENDED closes the window', async () => {
  const detail = (await call('GET', `/providers/${created.providerId}`, { token: adminA })).json;
  const remote = detail.affiliations.find((a) => a.availabilityType === 'REMOTE' && a.facilityId === null);

  // REMOTE (org-wide) -> OTHER: channels must be dropped automatically.
  const switched = await call('PATCH', `/affiliations/${remote.affiliationId}`, { token: adminA, body: { availabilityType: 'OTHER', availabilitySubtype: 'ON_CALL' } });
  assert.equal(switched.status, 200, JSON.stringify(switched.json));
  assert.deepEqual(switched.json.remoteChannels, []);
  assert.equal(switched.json.availabilitySubtype, 'ON_CALL');

  const primary = await call('PATCH', `/affiliations/${remote.affiliationId}`, { token: adminA, body: { isPrimary: true } });
  assert.equal(primary.json.isPrimary, true);
  const after = (await call('GET', `/providers/${created.providerId}/affiliations`, { token: adminA })).json.data;
  assert.equal(after.filter((a) => a.isPrimary).length, 1);

  const ended = await call('PATCH', `/affiliations/${remote.affiliationId}/status`, { token: adminA, body: { status: 'ENDED' } });
  assert.equal(ended.json.status, 'ENDED');
  assert.match(ended.json.effectiveTo, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await call('PATCH', `/affiliations/${remote.affiliationId}`, { token: adminA, body: { notes: 'x' } })).status, 409);
});

test('affiliations list across providers can be filtered by facility service', async () => {
  const byService = await call('GET', '/affiliations?facilityServiceId=100', { token: adminA });
  assert.equal(byService.json.data.length, 1);
  assert.equal(byService.json.data[0].provider.displayName, 'Dr. Asha Kumari Verma');
  assert.equal((await call('GET', '/affiliations?availabilityType=PHYSICAL&facilityId=10', { token: adminA })).json.pagination.totalItems, 1);
  assert.equal((await call('GET', '/affiliations?facilityId=10', { token: adminB })).json.data.length, 0);
});

test('soft-deleted providers drop out of the default list and cannot get new affiliations', async () => {
  const p = await call('POST', '/providers', { token: adminA, body: doctor({ firstName: 'Gone', registrations: [{ registrationBody: 'NMC', registrationNumber: 'NMC-2002' }] }) });
  await call('PATCH', `/providers/${p.json.providerId}/status`, { token: adminA, body: { status: 'DELETED' } });
  const list = await call('GET', '/providers?search=Gone', { token: adminA });
  assert.equal(list.json.data.length, 0);
  assert.equal((await call('GET', '/providers?search=Gone&status=DELETED', { token: adminA })).json.data.length, 1);
  assert.equal((await call('POST', `/providers/${p.json.providerId}/affiliations`, { token: adminA, body: { organizationId: 1, availabilityType: 'REMOTE', remoteChannels: ['VIDEO'] } })).status, 409);
});

test('organization / facility ids are verified against organization-admin-service with the caller token', async () => {
  const seenAuth = [];
  const orgService = http.createServer((req, res) => {
    seenAuth.push(req.headers.authorization);
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.url === '/organizations/1') return send(200, { organizationId: 1 });
    if (req.url === '/facilities/10') return send(200, { facilityId: 10, organizationId: 1 });
    if (req.url === '/facilities/20') return send(200, { facilityId: 20, organizationId: 99 }); // some other organization's facility
    return send(404, { error: { code: 'NOT_FOUND' } });
  });
  await new Promise((resolve) => orgService.listen(0, resolve));
  process.env.ORGANIZATION_SERVICE_URL = `http://127.0.0.1:${orgService.address().port}`;

  try {
    const p = await call('POST', '/providers', { token: adminA, body: doctor({ firstName: 'Ref', registrations: [{ registrationBody: 'NMC', registrationNumber: 'NMC-3003' }] }) });
    const path = `/providers/${p.json.providerId}/affiliations`;
    const post = (body) => call('POST', path, { token: adminA, body });

    const ok = await post({ organizationId: 1, facilityId: 10, availabilityType: 'PHYSICAL' });
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    assert.ok(seenAuth.every((h) => h === `Bearer ${adminA}`));

    const mismatch = await post({ organizationId: 1, facilityId: 20, availabilityType: 'PHYSICAL' });
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.json.error.code, 'INVALID_REFERENCE');

    const missingOrg = await post({ organizationId: 5, availabilityType: 'REMOTE', remoteChannels: ['VIDEO'] });
    assert.equal(missingOrg.status, 400);
    assert.match(missingOrg.json.error.message, /Organization does not exist/);
  } finally {
    delete process.env.ORGANIZATION_SERVICE_URL;
    await new Promise((resolve) => orgService.close(resolve));
  }
});

test('address uses the geography ids: names are filled in server-side and the chain is validated', async () => {
  const seen = [];
  const geo = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    seen.push({ path: url.pathname, authorization: req.headers.authorization, tenant: req.headers['x-tenant-uuid'] });
    const q = (name) => Number(url.searchParams.get(name));
    const send = (rows) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, data: rows })); };
    switch (url.pathname) {
      case '/geography/countries': return send([{ countryId: 104, name: 'India' }]);
      case '/geography/states': return send(q('countryId') === 104 ? [{ stateId: 7, name: 'Uttar Pradesh' }, { stateId: 8, name: 'Punjab' }] : []);
      case '/geography/districts': return send(q('stateId') === 7 ? [{ districtId: 70, name: 'Saharanpur' }] : q('stateId') === 8 ? [{ districtId: 80, name: 'Ludhiana' }] : []);
      case '/geography/sub-districts': return send(q('districtId') === 70 ? [{ subDistrictId: 700, name: 'Saharanpur Tehsil' }] : []);
      case '/geography/cities': return send(q('subDistrictId') === 700 ? [{ cityId: 7000, name: 'Saharanpur' }] : []);
      case '/geography/postal-codes': return send(q('cityId') === 7000 ? [{ postalCodeId: 70000, code: '247001' }] : []);
      default: res.writeHead(404); return res.end();
    }
  });
  await new Promise((resolve) => geo.listen(0, resolve));
  process.env.ORGANIZATION_SERVICE_URL = `http://127.0.0.1:${geo.address().port}`;
  process.env.ORGANIZATION_SERVICE_INTERNAL_TOKEN = 'internal-geo-token';

  const chain = { countryId: 104, stateId: 7, districtId: 70, subDistrictId: 700, cityId: 7000, postalCodeId: 70000 };
  try {
    const ok = await call('POST', '/providers', {
      token: adminA,
      body: doctor({ firstName: 'Geo', registrations: [{ registrationBody: 'NMC', registrationNumber: 'NMC-4004' }], ...chain }),
    });
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    assert.deepEqual(
      [ok.json.countryName, ok.json.stateName, ok.json.districtName, ok.json.subDistrictName, ok.json.city, ok.json.postalCode],
      ['India', 'Uttar Pradesh', 'Saharanpur', 'Saharanpur Tehsil', 'Saharanpur', '247001'],
    );
    assert.equal(ok.json.cityId, 7000);
    // the geography service gets the internal token + the caller's tenant — never the user's JWT
    assert.ok(seen.length >= 6);
    assert.ok(seen.every((r) => r.authorization === 'Bearer internal-geo-token' && r.tenant === TENANT_A));

    const bad = await call('PATCH', `/providers/${ok.json.providerId}`, { token: adminA, body: { stateId: 8 } }); // district 70 is not in Punjab
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_ADDRESS');
    assert.match(bad.json.error.message, /District 70 does not belong to the selected state/);

    const orphan = await call('PATCH', `/providers/${ok.json.providerId}`, { token: adminA, body: { subDistrictId: null } }); // city 7000 now has no sub-district
    assert.equal(orphan.status, 400);
    assert.match(orphan.json.error.message, /City needs sub-district/);

    const before = seen.length;
    const plain = await call('PATCH', `/providers/${ok.json.providerId}`, { token: adminA, body: { bio: 'No address change' } });
    assert.equal(plain.status, 200);
    assert.equal(seen.length, before); // an edit that doesn't touch the address makes no geography calls
    assert.equal(plain.json.city, 'Saharanpur');

    const cleared = await call('PATCH', `/providers/${ok.json.providerId}`, { token: adminA, body: { postalCodeId: null, cityId: null, subDistrictId: null } });
    assert.equal(cleared.status, 200, JSON.stringify(cleared.json));
    assert.equal(cleared.json.districtName, 'Saharanpur');
    assert.equal(cleared.json.city, null);
    assert.equal(cleared.json.subDistrictName, null);
    assert.equal(cleared.json.postalCode, null);
    assert.equal(cleared.json.cityId, null);

    const orphanCity = await call('POST', '/providers', {
      token: adminA,
      body: doctor({ firstName: 'Orphan', registrations: [{ registrationBody: 'NMC', registrationNumber: 'NMC-4005' }], cityId: 7000 }),
    });
    assert.equal(orphanCity.status, 400);
    assert.equal(orphanCity.json.error.code, 'INVALID_ADDRESS');
  } finally {
    delete process.env.ORGANIZATION_SERVICE_URL;
    delete process.env.ORGANIZATION_SERVICE_INTERNAL_TOKEN;
    await new Promise((resolve) => geo.close(resolve));
  }
});
