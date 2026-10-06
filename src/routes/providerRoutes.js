const express = require('express');
const router = express.Router();

const controller = require('../controllers/providerController');
const { validate } = require('../middleware/validate');
const { authorize } = require('../middleware/authentication');
const { PROVIDER_PERMISSIONS: P } = require('../utils/permissions');
const provider = require('../validations/provider.validation');
const affiliation = require('../validations/affiliation.validation');

// Paths are relative to /api/v1/provider-admin/providers (see app.js).
// Only a TENANT_ADMIN holds create/update; TENANT_USER holds read only.

/**
 * @openapi
 * /providers:
 *   post:
 *     tags: [Providers]
 *     summary: Register a provider (doctor), optionally with affiliations
 *     description: >
 *       TENANT_ADMIN only. Send the profile plus any of registrations, qualifications,
 *       specialties, languages, experiences, documents and affiliations in one call.
 *       A licensed provider type (DOCTOR, DENTIST, ...) needs at least one registration;
 *       a registration number can exist only once per tenant (409 DUPLICATE_REGISTRATION —
 *       add an affiliation to the existing provider instead).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ProviderCreateRequest' }
 *     responses:
 *       201: { description: Provider created (full detail) }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       409: { description: Registration number already registered in this tenant }
 *   get:
 *     tags: [Providers]
 *     summary: Paginated, filterable list of providers
 *     parameters:
 *       - { name: search, in: query, description: 'Name, code, email, phone or registration number', schema: { type: string } }
 *       - { name: status, in: query, schema: { type: string, enum: [ACTIVE, INACTIVE, SUSPENDED, DELETED] } }
 *       - { name: providerType, in: query, schema: { type: string } }
 *       - { name: verificationStatus, in: query, schema: { type: string, enum: [PENDING, VERIFIED, REJECTED] } }
 *       - { name: specialty, in: query, schema: { type: string } }
 *       - { name: organizationId, in: query, schema: { type: integer } }
 *       - { name: facilityId, in: query, schema: { type: integer } }
 *       - { name: availabilityType, in: query, schema: { type: string, enum: [PHYSICAL, REMOTE, OTHER] } }
 *       - { $ref: '#/components/parameters/PageParam' }
 *       - { $ref: '#/components/parameters/LimitParam' }
 *     responses:
 *       200: { description: 'Paginated providers ({ data, pagination })' }
 */
router.post('/', authorize(P.CREATE), validate(provider.createSchema), controller.create);
router.get('/', authorize(P.READ), validate(provider.listQuerySchema, 'query'), controller.getList);

/**
 * @openapi
 * /providers/list:
 *   get:
 *     tags: [Providers]
 *     summary: ACTIVE providers for dropdowns (optionally those affiliated with a facility / organization)
 *     responses:
 *       200: { description: '{ data: [{ providerId, displayName, ... }] }' }
 */
router.get('/list', authorize(P.READ), validate(provider.dropdownQuerySchema, 'query'), controller.getDropdownList);

/**
 * @openapi
 * /providers/{id}:
 *   get:
 *     tags: [Providers]
 *     summary: Full provider profile with qualifications, registrations, specialties, languages, experience, documents and affiliations
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Provider detail }
 *       404: { description: Not found in this tenant }
 *   patch:
 *     tags: [Providers]
 *     summary: Update a provider
 *     description: >
 *       Scalar fields change only when sent. A collection that is sent (registrations,
 *       qualifications, specialties, languages, experiences, documents) REPLACES the stored
 *       one — send [] to clear it; one that is omitted is left alone. Affiliations are managed
 *       through their own endpoints.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Updated provider }
 */
router.get('/:id', authorize(P.READ), validate(provider.idParam, 'params'), controller.getById);
router.patch('/:id', authorize(P.UPDATE), validate(provider.idParam, 'params'), validate(provider.updateSchema), controller.update);

/**
 * @openapi
 * /providers/{id}/status:
 *   patch:
 *     tags: [Providers]
 *     summary: Set ACTIVE / INACTIVE / SUSPENDED / DELETED (soft delete)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Updated provider }
 * /providers/{id}/verify:
 *   post:
 *     tags: [Providers]
 *     summary: Record the Tenant Admin's document verification (VERIFIED / REJECTED / PENDING)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Updated provider }
 */
router.patch('/:id/status', authorize(P.UPDATE), validate(provider.idParam, 'params'), validate(provider.statusSchema), controller.setStatus);
router.post('/:id/verify', authorize(P.UPDATE), validate(provider.idParam, 'params'), validate(provider.verifySchema), controller.verify);

/**
 * @openapi
 * /providers/{id}/affiliations:
 *   get:
 *     tags: [Affiliations]
 *     summary: Where this provider practises
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: '{ data: [affiliation] }' }
 *   post:
 *     tags: [Affiliations]
 *     summary: Register the provider in another organization / facility
 *     description: >
 *       availabilityType PHYSICAL needs a facility; REMOTE needs remoteChannels (VIDEO, AUDIO, CHAT);
 *       OTHER needs availabilitySubtype (ON_DEMAND, ON_CALL, HOME_VISIT, OUTREACH_CAMP, OTHER).
 *       The same provider may hold several affiliations, including PHYSICAL and REMOTE at one facility.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AffiliationCreateRequest' }
 *     responses:
 *       201: { description: Affiliation created }
 *       409: { description: Same provider / organization / facility / availability type already affiliated }
 */
router.get('/:id/affiliations', authorize(P.READ), validate(provider.idParam, 'params'), controller.listAffiliations);
router.post('/:id/affiliations', authorize(P.CREATE), validate(provider.idParam, 'params'), validate(affiliation.createSchema), controller.createAffiliation);

module.exports = router;
