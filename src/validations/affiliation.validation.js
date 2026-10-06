const { Joi } = require('../middleware/validate');
const { paginationQuerySchema } = require('../utils/pagination');

const AVAILABILITY_TYPES = ['PHYSICAL', 'REMOTE', 'OTHER'];
// Only meaningful for availabilityType OTHER.
const AVAILABILITY_SUBTYPES = ['ON_DEMAND', 'ON_CALL', 'HOME_VISIT', 'OUTREACH_CAMP', 'OTHER'];
const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'VISITING', 'CONSULTANT', 'CONTRACT', 'HONORARY'];
const REMOTE_CHANNELS = ['VIDEO', 'AUDIO', 'CHAT'];
const AFFILIATION_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ENDED'];

const positiveId = Joi.number().integer().positive();
const optionalText = (max) => Joi.string().trim().max(max).optional().allow('', null);

const dateOnly = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
      ? helpers.message('must be a valid date in YYYY-MM-DD format')
      : value;
  });

/**
 * The rules that depend on several fields at once. Shared by create (called
 * on the full object) and update (called after the service merges the patch
 * onto the stored row), same pattern as the appointment service's
 * validateRecurrenceFields.
 */
function validateAffiliationShape({
  availabilityType,
  availabilitySubtype,
  facilityId,
  departmentId,
  remoteChannels,
  roomOrChamber,
  facilityServiceIds,
  effectiveFrom,
  effectiveTo,
}) {
  const channels = remoteChannels || [];
  const subtype = availabilitySubtype || '';

  if (availabilityType === 'PHYSICAL') {
    if (!facilityId) return 'facilityId is required when availabilityType is PHYSICAL';
    if (channels.length) return 'remoteChannels must be empty when availabilityType is PHYSICAL';
    if (subtype) return 'availabilitySubtype is only allowed when availabilityType is OTHER';
  } else if (availabilityType === 'REMOTE') {
    if (!channels.length) return 'remoteChannels needs at least one of VIDEO, AUDIO, CHAT when availabilityType is REMOTE';
    if (roomOrChamber) return 'roomOrChamber must be empty when availabilityType is REMOTE';
    if (subtype) return 'availabilitySubtype is only allowed when availabilityType is OTHER';
  } else if (availabilityType === 'OTHER') {
    if (!subtype) return 'availabilitySubtype is required when availabilityType is OTHER (e.g. ON_DEMAND)';
    if (channels.length) return 'remoteChannels is only allowed when availabilityType is REMOTE';
  }

  if (departmentId && !facilityId) return 'departmentId requires facilityId';
  if (facilityServiceIds?.length && !facilityId) return 'facilityServiceIds requires facilityId';
  if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) return 'effectiveTo must not be before effectiveFrom';
  return null;
}

const fields = {
  organizationId: positiveId,
  facilityId: positiveId.allow(null),
  departmentId: positiveId.allow(null),
  availabilityType: Joi.string().valid(...AVAILABILITY_TYPES),
  availabilitySubtype: Joi.string().valid(...AVAILABILITY_SUBTYPES, '').allow(null),
  designation: optionalText(100),
  employmentType: Joi.string().valid(...EMPLOYMENT_TYPES).allow(null, ''),
  employeeCode: optionalText(50),
  roomOrChamber: optionalText(100),
  remoteChannels: Joi.array().items(Joi.string().valid(...REMOTE_CHANNELS)).unique().max(REMOTE_CHANNELS.length),
  consultationFee: Joi.number().min(0).max(9999999.99).precision(2).allow(null),
  followUpFee: Joi.number().min(0).max(9999999.99).precision(2).allow(null),
  currency: Joi.string().length(3).uppercase(),
  followUpValidDays: Joi.number().integer().min(0).max(365).allow(null),
  consultationDurationMinutes: Joi.number().integer().min(1).max(480).allow(null),
  acceptsNewPatients: Joi.boolean(),
  isPrimary: Joi.boolean(),
  effectiveFrom: dateOnly.allow(null),
  effectiveTo: dateOnly.allow(null),
  notes: optionalText(500),
  facilityServiceIds: Joi.array().items(positiveId).unique().max(100),
};

const affiliationCreateObject = Joi.object({
  ...fields,
  organizationId: fields.organizationId.required(),
  availabilityType: fields.availabilityType.required(),
});

const createSchema = affiliationCreateObject.custom((value, helpers) => {
  const error = validateAffiliationShape(value);
  return error ? helpers.message(error) : value;
});

const updateSchema = Joi.object({
  ...fields,
  status: Joi.string().valid(...AFFILIATION_STATUSES),
}).min(1);

const statusSchema = Joi.object({ status: Joi.string().valid(...AFFILIATION_STATUSES).required() });

const listQuerySchema = paginationQuerySchema({
  providerId: positiveId.optional(),
  organizationId: positiveId.optional(),
  facilityId: positiveId.optional(),
  departmentId: positiveId.optional(),
  facilityServiceId: positiveId.optional(),
  availabilityType: Joi.string().valid(...AVAILABILITY_TYPES, '').optional(),
  status: Joi.string().valid(...AFFILIATION_STATUSES, '').optional(),
});

const idParam = Joi.object({ id: positiveId.required() });
const providerAffiliationParams = Joi.object({ id: positiveId.required() });

module.exports = {
  AVAILABILITY_TYPES,
  AVAILABILITY_SUBTYPES,
  EMPLOYMENT_TYPES,
  REMOTE_CHANNELS,
  AFFILIATION_STATUSES,
  validateAffiliationShape,
  affiliationCreateObject,
  createSchema,
  updateSchema,
  statusSchema,
  listQuerySchema,
  idParam,
  providerAffiliationParams,
  dateOnly,
};
