const { Joi } = require('../middleware/validate');
const { paginationQuerySchema } = require('../utils/pagination');
const { dateOnly, affiliationCreateObject, validateAffiliationShape, AVAILABILITY_TYPES } = require('./affiliation.validation');

const PROVIDER_TYPES = ['DOCTOR', 'DENTIST', 'AYUSH_PRACTITIONER', 'NURSE', 'MIDWIFE', 'PHYSIOTHERAPIST', 'PSYCHOLOGIST', 'NUTRITIONIST', 'OTHER'];
// These need a council / licence number; NUTRITIONIST and OTHER don't.
const LICENSED_TYPES = ['DOCTOR', 'DENTIST', 'AYUSH_PRACTITIONER', 'NURSE', 'MIDWIFE', 'PHYSIOTHERAPIST', 'PSYCHOLOGIST'];
const SYSTEMS_OF_MEDICINE = ['ALLOPATHY', 'AYURVEDA', 'HOMEOPATHY', 'UNANI', 'SIDDHA', 'YOGA_NATUROPATHY', 'DENTAL', 'OTHER'];
const GENDERS = ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'];
const STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED'];
const VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'];
const SPECIALTY_LEVELS = ['PRIMARY', 'SECONDARY', 'SUPER_SPECIALTY'];
const DOCUMENT_TYPES = ['REGISTRATION_CERTIFICATE', 'DEGREE_CERTIFICATE', 'ID_PROOF', 'PHOTO', 'SIGNATURE', 'EXPERIENCE_LETTER', 'OTHER'];

const text = (max) => Joi.string().trim().max(max).allow('', null);
const phone = Joi.string().trim().pattern(/^[0-9+\-\s()]{5,20}$/).message('must be a valid phone number').allow('', null);
const year = Joi.number().integer().min(1900).max(new Date().getFullYear() + 1).allow(null);

const registrationItem = Joi.object({
  registrationBody: Joi.string().trim().max(100).required(),
  registrationNumber: Joi.string().trim().max(60).required(),
  registeredState: text(100),
  issuedOn: dateOnly.allow(null),
  validUntil: dateOnly.allow(null),
  isPrimary: Joi.boolean().default(false),
});

const qualificationItem = Joi.object({
  degree: Joi.string().trim().max(100).required(),
  specialization: text(150),
  institution: text(200),
  university: text(200),
  country: text(100),
  yearOfCompletion: year,
});

const specialtyItem = Joi.object({
  specialtyName: Joi.string().trim().max(150).required(),
  specialtyCode: text(50),
  specialtyLevel: Joi.string().valid(...SPECIALTY_LEVELS).default('PRIMARY'),
});

const languageItem = Joi.object({
  languageName: Joi.string().trim().max(60).required(),
  languageCode: text(10),
});

const experienceItem = Joi.object({
  organizationName: Joi.string().trim().max(200).required(),
  designation: text(100),
  department: text(100),
  location: text(150),
  fromDate: dateOnly.allow(null),
  toDate: dateOnly.allow(null),
  isCurrent: Joi.boolean().default(false),
  description: text(500),
});

const documentItem = Joi.object({
  documentType: Joi.string().valid(...DOCUMENT_TYPES).required(),
  documentName: Joi.string().trim().max(150).required(),
  fileUrl: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(500).required(),
  expiresOn: dateOnly.allow(null),
});

const profileFields = {
  providerType: Joi.string().valid(...PROVIDER_TYPES),
  systemOfMedicine: Joi.string().valid(...SYSTEMS_OF_MEDICINE).allow(null, ''),
  userId: Joi.number().integer().positive().allow(null),
  title: text(20),
  firstName: Joi.string().trim().max(100),
  middleName: text(100),
  lastName: text(100),
  displayName: text(255),
  gender: Joi.string().valid(...GENDERS).allow(null, ''),
  dateOfBirth: dateOnly.allow(null),
  nationality: text(60),
  photoUrl: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(500).allow('', null),
  bio: text(5000),
  email: Joi.string().trim().email().max(255).allow('', null),
  phoneCountryCode: Joi.string().trim().pattern(/^\+?\d{1,4}$/).allow('', null),
  phoneNumber: phone,
  alternatePhoneNumber: phone,
  emergencyContactName: text(150),
  emergencyContactPhone: phone,
  addressLine1: text(255),
  addressLine2: text(255),
  city: text(100),
  subDistrictName: text(100),
  districtName: text(100),
  stateName: text(100),
  countryName: text(100),
  postalCode: text(20),
  hprId: text(50),
  practiceStartDate: dateOnly.allow(null),
  memberships: text(2000),
  awards: text(2000),
  idProofType: text(30),
  idProofLast4: Joi.string().trim().length(4).alphanum().allow('', null),
};

const collections = {
  registrations: Joi.array().items(registrationItem).max(20),
  qualifications: Joi.array().items(qualificationItem).max(30),
  specialties: Joi.array().items(specialtyItem).max(20),
  languages: Joi.array().items(languageItem).max(30),
  experiences: Joi.array().items(experienceItem).max(50),
  documents: Joi.array().items(documentItem).max(50),
};

/** Rules that span several fields / rows. Returns an error message or null. */
function validateProfileShape({ providerType, registrations, specialties, experiences }) {
  if (LICENSED_TYPES.includes(providerType) && !(registrations && registrations.length)) {
    return `At least one registration (council / licence number) is required for providerType ${providerType}`;
  }
  if (registrations && registrations.filter((r) => r.isPrimary).length > 1) {
    return 'Only one registration can be marked primary';
  }
  if (specialties && specialties.filter((s) => s.specialtyLevel === 'PRIMARY').length > 1) {
    return 'Only one specialty can have specialtyLevel PRIMARY';
  }
  if (registrations) {
    const keys = registrations.map((r) => `${r.registrationBody.toLowerCase()}|${r.registrationNumber.toLowerCase()}`);
    if (new Set(keys).size !== keys.length) return 'The same registration body and number is listed twice';
  }
  for (const e of experiences || []) {
    if (e.fromDate && e.toDate && e.toDate < e.fromDate) return `Experience at ${e.organizationName}: toDate must not be before fromDate`;
  }
  return null;
}

const createSchema = Joi.object({
  ...profileFields,
  providerType: profileFields.providerType.default('DOCTOR'),
  firstName: profileFields.firstName.required(),
  ...collections,
  // Optional: register the provider at one or more facilities in the same call.
  affiliations: Joi.array().items(affiliationCreateObject).max(20),
}).custom((value, helpers) => {
  const error = validateProfileShape(value);
  if (error) return helpers.message(error);
  for (const affiliation of value.affiliations || []) {
    const affiliationError = validateAffiliationShape(affiliation);
    if (affiliationError) return helpers.message(affiliationError);
  }
  return value;
});

// PATCH semantics: scalar fields replace only when sent; a collection that is
// sent REPLACES the stored one (send [] to clear it), one that is omitted is
// left alone. Affiliations have their own endpoints.
const updateSchema = Joi.object({ ...profileFields, ...collections }).min(1);

const statusSchema = Joi.object({ status: Joi.string().valid(...STATUSES).required() });

const verifySchema = Joi.object({
  verificationStatus: Joi.string().valid(...VERIFICATION_STATUSES).required(),
  remarks: text(500),
});

const listQuerySchema = paginationQuerySchema({
  search: Joi.string().trim().max(100).allow('').optional(),
  status: Joi.string().valid(...STATUSES, '').optional(),
  providerType: Joi.string().valid(...PROVIDER_TYPES, '').optional(),
  verificationStatus: Joi.string().valid(...VERIFICATION_STATUSES, '').optional(),
  specialty: Joi.string().trim().max(150).allow('').optional(),
  organizationId: Joi.number().integer().positive().optional(),
  facilityId: Joi.number().integer().positive().optional(),
  availabilityType: Joi.string().valid(...AVAILABILITY_TYPES, '').optional(),
});

const dropdownQuerySchema = Joi.object({
  facilityId: Joi.number().integer().positive().optional(),
  organizationId: Joi.number().integer().positive().optional(),
});

const idParam = Joi.object({ id: Joi.number().integer().positive().required() });

module.exports = {
  PROVIDER_TYPES,
  LICENSED_TYPES,
  SYSTEMS_OF_MEDICINE,
  GENDERS,
  STATUSES,
  VERIFICATION_STATUSES,
  SPECIALTY_LEVELS,
  DOCUMENT_TYPES,
  validateProfileShape,
  createSchema,
  updateSchema,
  statusSchema,
  verifySchema,
  listQuerySchema,
  dropdownQuerySchema,
  idParam,
};
