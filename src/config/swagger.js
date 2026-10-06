const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const {
  PROVIDER_TYPES, SYSTEMS_OF_MEDICINE, GENDERS, STATUSES, VERIFICATION_STATUSES, SPECIALTY_LEVELS, DOCUMENT_TYPES,
} = require('../validations/provider.validation');
const {
  AVAILABILITY_TYPES, AVAILABILITY_SUBTYPES, EMPLOYMENT_TYPES, REMOTE_CHANNELS, AFFILIATION_STATUSES,
} = require('../validations/affiliation.validation');

const basePath = '/api/v1/provider-admin';

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'SP3 Digital — Provider Admin Service API',
      version: '1.0.0',
      description:
        'Registry of doctors / providers for the SP3 Digital healthcare platform. A Tenant Admin registers a ' +
        'provider once (profile, qualifications, council registrations, specialties, languages, experience, ' +
        'documents) and then affiliates them with one or more organizations / facilities, each affiliation ' +
        'carrying an availability type: PHYSICAL, REMOTE or OTHER (ON_DEMAND, ON_CALL, HOME_VISIT, ...).\n\n' +
        'Every route below `' + basePath + '` (other than `/health`) requires a bearer token issued by ' +
        'identity-admin-service. Permissions: `provider-admin:provider:create`, `:read`, `:update` — ' +
        'TENANT_ADMIN holds all three, TENANT_USER holds read only. ' +
        'organization / facility / department / facility-service ids are validated against ' +
        'organization-admin-service (see ORGANIZATION_SERVICE_URL).',
    },
    servers: [{ url: basePath }],
    tags: [
      { name: 'Health', description: 'Liveness check (no auth)' },
      { name: 'Providers', description: 'Provider profile, registrations, qualifications, specialties, languages, experience, documents' },
      { name: 'Affiliations', description: 'Where and how a provider practises: organization / facility, availability type, fees, services' },
    ],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      parameters: {
        PageParam: { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        LimitParam: { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      },
      responses: {
        ValidationError: { description: 'Request validation failed' },
        Unauthenticated: { description: 'Missing or invalid bearer token' },
        Forbidden: { description: 'Token lacks the required provider-admin permission' },
      },
      schemas: {
        AffiliationCreateRequest: {
          type: 'object',
          required: ['organizationId', 'availabilityType'],
          properties: {
            organizationId: { type: 'integer' },
            facilityId: { type: 'integer', nullable: true, description: 'Required for PHYSICAL; null = the organization as a whole' },
            departmentId: { type: 'integer', nullable: true },
            availabilityType: { type: 'string', enum: AVAILABILITY_TYPES },
            availabilitySubtype: { type: 'string', enum: AVAILABILITY_SUBTYPES, description: 'Only for OTHER' },
            designation: { type: 'string' },
            employmentType: { type: 'string', enum: EMPLOYMENT_TYPES },
            roomOrChamber: { type: 'string', description: 'PHYSICAL only' },
            remoteChannels: { type: 'array', items: { type: 'string', enum: REMOTE_CHANNELS }, description: 'REMOTE only' },
            consultationFee: { type: 'number' },
            followUpFee: { type: 'number' },
            currency: { type: 'string', example: 'INR' },
            consultationDurationMinutes: { type: 'integer' },
            acceptsNewPatients: { type: 'boolean' },
            isPrimary: { type: 'boolean' },
            effectiveFrom: { type: 'string', format: 'date' },
            effectiveTo: { type: 'string', format: 'date' },
            facilityServiceIds: { type: 'array', items: { type: 'integer' }, description: 'Facility services delivered under this affiliation' },
          },
        },
        ProviderCreateRequest: {
          type: 'object',
          required: ['firstName'],
          properties: {
            providerType: { type: 'string', enum: PROVIDER_TYPES, default: 'DOCTOR' },
            systemOfMedicine: { type: 'string', enum: SYSTEMS_OF_MEDICINE },
            title: { type: 'string', example: 'Dr.' },
            firstName: { type: 'string' },
            middleName: { type: 'string' },
            lastName: { type: 'string' },
            gender: { type: 'string', enum: GENDERS },
            dateOfBirth: { type: 'string', format: 'date' },
            email: { type: 'string', format: 'email' },
            phoneCountryCode: { type: 'string', example: '+91' },
            phoneNumber: { type: 'string' },
            practiceStartDate: { type: 'string', format: 'date', description: 'Years of experience are derived from this' },
            hprId: { type: 'string', description: 'ABDM Healthcare Professionals Registry id' },
            registrations: {
              type: 'array',
              items: {
                type: 'object',
                required: ['registrationBody', 'registrationNumber'],
                properties: { registrationBody: { type: 'string', example: 'NMC' }, registrationNumber: { type: 'string' }, registeredState: { type: 'string' }, issuedOn: { type: 'string', format: 'date' }, validUntil: { type: 'string', format: 'date' }, isPrimary: { type: 'boolean' } },
              },
            },
            qualifications: { type: 'array', items: { type: 'object', required: ['degree'], properties: { degree: { type: 'string', example: 'MBBS' }, specialization: { type: 'string' }, institution: { type: 'string' }, university: { type: 'string' }, country: { type: 'string' }, yearOfCompletion: { type: 'integer' } } } },
            specialties: { type: 'array', items: { type: 'object', required: ['specialtyName'], properties: { specialtyName: { type: 'string' }, specialtyLevel: { type: 'string', enum: SPECIALTY_LEVELS } } } },
            languages: { type: 'array', items: { type: 'object', required: ['languageName'], properties: { languageName: { type: 'string' }, languageCode: { type: 'string' } } } },
            experiences: { type: 'array', items: { type: 'object', required: ['organizationName'], properties: { organizationName: { type: 'string' }, designation: { type: 'string' }, fromDate: { type: 'string', format: 'date' }, toDate: { type: 'string', format: 'date' }, isCurrent: { type: 'boolean' } } } },
            documents: { type: 'array', items: { type: 'object', required: ['documentType', 'documentName', 'fileUrl'], properties: { documentType: { type: 'string', enum: DOCUMENT_TYPES }, documentName: { type: 'string' }, fileUrl: { type: 'string', format: 'uri' } } } },
            affiliations: { type: 'array', items: { $ref: '#/components/schemas/AffiliationCreateRequest' } },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [path.join(__dirname, '../routes/*.js'), path.join(__dirname, '../app.js')],
};

module.exports = swaggerJsdoc(options);
