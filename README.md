# sp3digital-provider-admin-service

Provider (doctor) registry for the SP3 Digital healthcare platform. Owns the
**PROVIDER** bounded context:

- **Who the provider is** — profile, contact, address, council registrations,
  qualifications, specialties, languages, work experience, document links,
  verification status.
- **Where and how they practise** — *affiliations* to an organization or
  facility, each with an availability type: **PHYSICAL**, **REMOTE**, or
  **OTHER** (`ON_DEMAND`, `ON_CALL`, `HOME_VISIT`, `OUTREACH_CAMP`, `OTHER`).

Stack and layering match `sp3digital-appointment-admin-service`:
Node + Express 5 + Sequelize + MySQL, `controller → service → model`, Joi
validation, Swagger at `/docs`, soft delete through a `status` column, JWTs
minted by `sp3digital-identity-admin-service`.

## Why a separate service

A doctor is not organization master data and not an appointment. One doctor
works across several organizations and facilities, so the record cannot live
inside any one organization's database. Like the other services, this one
holds `organization_id`, `facility_id`, `department_id`,
`facility_service_id` and `user_id` as plain `bigint unsigned` columns with no
cross-database foreign keys.

## Rules the service enforces

| Rule | Where |
|---|---|
| Only a Tenant Admin registers / edits (`create`, `update`); Tenant User can only `read` | `utils/permissions.js`, route guards |
| Everything is scoped to the token's `tenant_uuid` | every query |
| A registration number (body + number) exists once per tenant. A second attempt gets `409 DUPLICATE_REGISTRATION` naming the existing doctor — add an affiliation to them instead | `providerService`, unique key |
| Licensed provider types (doctor, dentist, AYUSH, nurse, ...) need at least one registration | `provider.validation.js` |
| One affiliation per provider + organization + facility + availability type (a doctor can be PHYSICAL and REMOTE at the same facility as two rows, each with its own fee and channels) | `affiliationService`, unique key |
| PHYSICAL needs a facility; REMOTE needs ≥1 channel (VIDEO / AUDIO / CHAT); OTHER needs a subtype; department and services need a facility | `validateAffiliationShape` |
| Organization / facility / department / facility-service ids are checked against organization-admin-service using the **caller's own token**, so tenant scoping is enforced by that service | `clients/organizationDirectory.js` |
| At most one primary affiliation and one primary registration per provider | services |
| Address uses the shared geography reference data: the browser sends only `countryId, stateId, districtId, subDistrictId, cityId, postalCodeId`; the service checks they form a real chain (each level inside the one above) and fills in the names itself, so ids and names can never disagree. Uses `ORGANIZATION_SERVICE_INTERNAL_TOKEN` server-side | `clients/geographyDirectory.js` |
| Only the **last 4 characters** of an ID proof are stored; documents are links, not files | schema |

## API (base `/api/v1/provider-admin`)

| Method | Path | Permission |
|---|---|---|
| POST | `/providers` | create |
| GET | `/providers` (search, status, providerType, verificationStatus, specialty, organizationId, facilityId, availabilityType) | read |
| GET | `/providers/list` (dropdown; optional facilityId / organizationId) | read |
| GET / PATCH | `/providers/:id` | read / update |
| PATCH | `/providers/:id/status` | update |
| POST | `/providers/:id/verify` | update |
| GET / POST | `/providers/:id/affiliations` | read / create |
| GET | `/affiliations` (providerId, organizationId, facilityId, departmentId, facilityServiceId, availabilityType, status) | read |
| GET / PATCH | `/affiliations/:id` | read / update |
| PATCH | `/affiliations/:id/status` | update |

`POST /providers` accepts the profile plus `registrations`, `qualifications`,
`specialties`, `languages`, `experiences`, `documents` and `affiliations` in
one call. On `PATCH`, a collection that is sent replaces the stored one
(`[]` clears it); one that is omitted is untouched.

## Setup

```bash
cp .env.example .env          # DB credentials, JWT settings, ORGANIZATION_SERVICE_URL
npm install
mysql -u root -p < database/complete_db_script/script-sp3digital_providers.sql
# in the identity database:
mysql -u root -p sp3digital_identity < database/seeds/identity-admin-provider-rbac.sql
npm run dev                   # http://localhost:3300/docs
# databases created before the geography change: also run
#   database/complete_db_script/2026-10-07-add-provider-geo-ids.sql
npm test                      # 15 tests, in-memory SQLite, no setup
```

`ADMIN_JWT_*` must be the same values identity-admin-service signs with.
**Set `ORGANIZATION_SERVICE_URL` and `ORGANIZATION_SERVICE_INTERNAL_TOKEN` in every real environment** — without it the
organization / facility ids are accepted unchecked (a warning is logged).

## Next integration steps

1. `appointment-admin-service`: add an optional `provider_affiliation_id` to
   slot configs so slots belong to a doctor, not just a facility service
   (`provider_affiliation_services` already records which facility services a
   doctor delivers).
2. File upload for documents (today they are links).
3. Optional: let a doctor log in — link `providers.user_id` to an identity user.
