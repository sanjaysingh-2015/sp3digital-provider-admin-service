const express = require('express');
const router = express.Router();

const controller = require('../controllers/affiliationController');
const { validate } = require('../middleware/validate');
const { authorize } = require('../middleware/authentication');
const { PROVIDER_PERMISSIONS: P } = require('../utils/permissions');
const affiliation = require('../validations/affiliation.validation');

// Paths are relative to /api/v1/provider-admin/affiliations (see app.js).

/**
 * @openapi
 * /affiliations:
 *   get:
 *     tags: [Affiliations]
 *     summary: Affiliations across all providers — e.g. "who practises at this facility, and how"
 *     parameters:
 *       - { name: providerId, in: query, schema: { type: integer } }
 *       - { name: organizationId, in: query, schema: { type: integer } }
 *       - { name: facilityId, in: query, schema: { type: integer } }
 *       - { name: departmentId, in: query, schema: { type: integer } }
 *       - { name: facilityServiceId, in: query, schema: { type: integer } }
 *       - { name: availabilityType, in: query, schema: { type: string, enum: [PHYSICAL, REMOTE, OTHER] } }
 *       - { name: status, in: query, schema: { type: string, enum: [ACTIVE, INACTIVE, SUSPENDED, ENDED] } }
 *       - { $ref: '#/components/parameters/PageParam' }
 *       - { $ref: '#/components/parameters/LimitParam' }
 *     responses:
 *       200: { description: 'Paginated affiliations, each with a provider summary' }
 */
router.get('/', authorize(P.READ), validate(affiliation.listQuerySchema, 'query'), controller.getList);

/**
 * @openapi
 * /affiliations/{id}:
 *   get:
 *     tags: [Affiliations]
 *     summary: One affiliation
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Affiliation }
 *   patch:
 *     tags: [Affiliations]
 *     summary: Edit an affiliation (fees, channels, services, validity, ...)
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Updated affiliation }
 * /affiliations/{id}/status:
 *   patch:
 *     tags: [Affiliations]
 *     summary: Set ACTIVE / INACTIVE / SUSPENDED / ENDED
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Updated affiliation }
 */
router.get('/:id', authorize(P.READ), validate(affiliation.idParam, 'params'), controller.getById);
router.patch('/:id', authorize(P.UPDATE), validate(affiliation.idParam, 'params'), validate(affiliation.updateSchema), controller.update);
router.patch('/:id/status', authorize(P.UPDATE), validate(affiliation.idParam, 'params'), validate(affiliation.statusSchema), controller.setStatus);

module.exports = router;
