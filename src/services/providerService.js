const { Op } = require('sequelize');
const {
  sequelize,
  Provider,
  ProviderRegistration,
  ProviderQualification,
  ProviderSpecialty,
  ProviderLanguage,
  ProviderExperience,
  ProviderDocument,
  ProviderAffiliation,
  ProviderAffiliationService,
} = require('../models');
const affiliationService = require('./affiliationService');
const { toSequelizePage, buildEnvelope } = require('../utils/pagination');
const { providerCode, yearsSince } = require('../utils/code.util');
const { httpError, providerNotFound } = require('../utils/errors');
const { validateProfileShape, LICENSED_TYPES } = require('../validations/provider.validation');
const { validateReferences } = require('../clients/organizationDirectory');
const { resolveAddress } = require('../clients/geographyDirectory');

const PROFILE_FIELDS = [
  'providerType', 'systemOfMedicine', 'userId', 'title', 'firstName', 'middleName', 'lastName', 'displayName',
  'gender', 'dateOfBirth', 'nationality', 'photoUrl', 'bio', 'email', 'phoneCountryCode', 'phoneNumber',
  'alternatePhoneNumber', 'emergencyContactName', 'emergencyContactPhone', 'addressLine1', 'addressLine2', 'countryId', 'stateId', 'districtId', 'subDistrictId', 'cityId', 'postalCodeId', 'city',
  'subDistrictName', 'districtName', 'stateName', 'countryName', 'postalCode', 'hprId', 'practiceStartDate',
  'memberships', 'awards', 'idProofType', 'idProofLast4',
];
// Geography ids the browser sends -> the denormalized name column the service fills in.
const GEO_NAME_COLUMN = {
  countryId: 'countryName',
  stateId: 'stateName',
  districtId: 'districtName',
  subDistrictId: 'subDistrictName',
  cityId: 'city',
  postalCodeId: 'postalCode',
};

/**
 * When any geography id is sent, validate the whole effective chain (patch laid
 * over the stored ids) and return the id + name columns to write. Names for
 * levels that are not set are cleared, so ids and names can never disagree.
 */
async function resolveGeoColumns(patch, stored, ctx) {
  const touched = Object.keys(GEO_NAME_COLUMN).some((key) => patch[key] !== undefined);
  if (!touched) return {};
  const effective = {};
  for (const key of Object.keys(GEO_NAME_COLUMN)) {
    effective[key] = patch[key] !== undefined ? patch[key] : (stored ? stored[key] : null) ?? null;
  }
  const names = await resolveAddress(effective, ctx);
  if (names === null) return {}; // geography check not configured — keep what was sent
  const columns = {};
  for (const [key, nameColumn] of Object.entries(GEO_NAME_COLUMN)) {
    columns[key] = effective[key] || null;
    columns[nameColumn] = names[key] ?? null;
  }
  return columns;
}

const NAME_PARTS = ['title', 'firstName', 'middleName', 'lastName'];
const SORTABLE = { displayName: 'displayName', createdOn: 'createdOn', providerCode: 'providerCode', status: 'status', providerType: 'providerType' };

// '' from a form field means "not provided" — store NULL rather than an empty string.
const blankToNull = (value) => (value === '' ? null : value);
const buildDisplayName = (p) => [p.title, p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ').trim();

const CHILD_INCLUDES = [
  { model: ProviderRegistration, as: 'registrations' },
  { model: ProviderQualification, as: 'qualifications' },
  { model: ProviderSpecialty, as: 'specialties' },
  { model: ProviderLanguage, as: 'languages' },
  { model: ProviderExperience, as: 'experiences' },
  { model: ProviderDocument, as: 'documents' },
];

const plainOf = (row) => (row.get ? row.get({ plain: true }) : row);

function stripChild(item, drop = []) {
  const copy = { ...item };
  for (const key of ['providerId', 'registrationId', 'qualificationId', 'specialtyId', 'languageId', 'experienceId', 'documentId', 'tenantUuid', ...drop]) delete copy[key];
  return copy;
}

function toDetail(provider, affiliations) {
  const p = plainOf(provider);
  const primarySpecialty = (p.specialties || []).find((s) => s.specialtyLevel === 'PRIMARY') || (p.specialties || [])[0];
  const out = {
    providerId: p.providerId,
    providerUuid: p.providerUuid,
    tenantUuid: p.tenantUuid,
    providerCode: p.providerCode,
    primarySpecialty: primarySpecialty?.specialtyName ?? null,
    experienceYears: yearsSince(p.practiceStartDate),
    verificationStatus: p.verificationStatus,
    verificationRemarks: p.verificationRemarks,
    verifiedBy: p.verifiedBy,
    verifiedOn: p.verifiedOn,
    status: p.status,
    createdBy: p.createdBy,
    createdOn: p.createdOn,
    modifiedBy: p.modifiedBy,
    modifiedOn: p.modifiedOn,
    registrations: (p.registrations || []).map((r) => stripChild(r)),
    qualifications: (p.qualifications || []).map((q) => stripChild(q)),
    specialties: (p.specialties || []).map((s) => stripChild(s)),
    languages: (p.languages || []).map((l) => stripChild(l)),
    experiences: (p.experiences || []).map((e) => stripChild(e)),
    documents: (p.documents || []).map((d) => stripChild(d)),
    affiliations,
  };
  for (const field of PROFILE_FIELDS) out[field] = p[field];
  return out;
}

async function findDuplicateRegistration(tenantUuid, registrations, { excludeProviderId, transaction } = {}) {
  for (const reg of registrations || []) {
    const where = {
      tenant_uuid: tenantUuid,
      registration_body: reg.registrationBody,
      registration_number: reg.registrationNumber,
    };
    if (excludeProviderId) where.provider_id = { [Op.ne]: excludeProviderId };
    const hit = await ProviderRegistration.findOne({
      where,
      include: [{ model: Provider, as: 'provider', attributes: ['providerId', 'providerCode', 'displayName'] }],
      transaction,
    });
    if (hit) {
      const who = hit.provider;
      throw httpError(
        409,
        'DUPLICATE_REGISTRATION',
        `Registration ${reg.registrationBody} ${reg.registrationNumber} already belongs to ${who.displayName} (${who.providerCode}). ` +
          'Add an affiliation to that provider instead of registering them again.',
        [`existingProviderId=${who.providerId}`],
      );
    }
  }
}

function normalizeCollections(payload) {
  const out = { ...payload };
  if (out.registrations) {
    out.registrations = out.registrations.map((r) => ({
      ...r,
      registrationBody: r.registrationBody.trim(),
      registrationNumber: r.registrationNumber.trim(),
      registeredState: blankToNull(r.registeredState),
    }));
    // The first registration is the primary one unless the caller marked another.
    if (out.registrations.length && !out.registrations.some((r) => r.isPrimary)) out.registrations[0].isPrimary = true;
  }
  if (out.specialties?.length && !out.specialties.some((s) => s.specialtyLevel === 'PRIMARY')) {
    out.specialties = out.specialties.map((s, i) => (i === 0 ? { ...s, specialtyLevel: 'PRIMARY' } : s));
  }
  if (out.languages) {
    const seen = new Set();
    out.languages = out.languages.filter((l) => {
      const key = l.languageName.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return out;
}

async function writeChildren(providerId, tenantUuid, payload, transaction) {
  const replace = async (Model, key, rows, map = (r) => r) => {
    if (rows === undefined) return;
    await Model.destroy({ where: { provider_id: providerId }, transaction });
    if (rows.length) await Model.bulkCreate(rows.map((r) => ({ ...map(r), providerId })), { transaction });
  };
  await replace(ProviderRegistration, 'registrations', payload.registrations, (r) => ({ ...r, tenantUuid }));
  await replace(ProviderQualification, 'qualifications', payload.qualifications);
  await replace(ProviderSpecialty, 'specialties', payload.specialties);
  await replace(ProviderLanguage, 'languages', payload.languages);
  await replace(ProviderExperience, 'experiences', payload.experiences);
  await replace(ProviderDocument, 'documents', payload.documents);
}

class ProviderService {
  async create(rawPayload, ctx) {
    const payload = normalizeCollections(rawPayload);
    const { tenantUuid, userId } = ctx;

    await findDuplicateRegistration(tenantUuid, payload.registrations);
    const geoColumns = await resolveGeoColumns(payload, null, ctx);
    for (const affiliation of payload.affiliations || []) {
      await validateReferences({ token: ctx.token, ...affiliation });
    }

    let providerId;
    try {
      providerId = await sequelize.transaction(async (transaction) => {
        const values = {};
        for (const field of PROFILE_FIELDS) if (payload[field] !== undefined) values[field] = blankToNull(payload[field]);
        Object.assign(values, geoColumns);
        values.displayName = values.displayName || buildDisplayName(payload);

        const provider = await Provider.create(
          { ...values, tenantUuid, status: 'ACTIVE', verificationStatus: 'PENDING', createdBy: userId || null, modifiedBy: userId || null },
          { transaction },
        );
        await provider.update({ providerCode: providerCode(provider.providerId) }, { transaction });
        await writeChildren(provider.providerId, tenantUuid, payload, transaction);

        for (const affiliation of payload.affiliations || []) {
          await affiliationService.createInTransaction(provider, affiliation, ctx, transaction);
        }
        return provider.providerId;
      });
    } catch (error) {
      // Two admins registering the same licence at the same instant.
      if (error.name === 'SequelizeUniqueConstraintError') {
        throw httpError(409, 'DUPLICATE_REGISTRATION', 'A provider with one of these registration numbers already exists');
      }
      throw error;
    }
    return this.getById(providerId, ctx);
  }

  async getById(providerId, { tenantUuid }) {
    const provider = await Provider.findOne({
      where: { provider_id: providerId, tenant_uuid: tenantUuid },
      include: CHILD_INCLUDES,
      order: [
        [{ model: ProviderRegistration, as: 'registrations' }, 'isPrimary', 'DESC'],
        [{ model: ProviderQualification, as: 'qualifications' }, 'yearOfCompletion', 'ASC'],
        [{ model: ProviderExperience, as: 'experiences' }, 'fromDate', 'DESC'],
      ],
    });
    if (!provider) throw providerNotFound();
    const affiliations = await affiliationService.listForProvider(providerId, { tenantUuid });
    return toDetail(provider, affiliations);
  }

  /** provider ids matching an affiliation-level filter (organization / facility / availability type). */
  async #idsByAffiliation({ tenantUuid, organizationId, facilityId, availabilityType }) {
    const where = { tenant_uuid: tenantUuid, status: 'ACTIVE' };
    if (organizationId) where.organization_id = organizationId;
    if (facilityId) where.facility_id = facilityId;
    if (availabilityType) where.availability_type = availabilityType;
    const rows = await ProviderAffiliation.findAll({ where, attributes: ['providerId'], group: ['provider_id'] });
    return rows.map((r) => r.providerId);
  }

  async getList({ page, limit, sortBy, sortDir, tenantUuid, search, status, providerType, verificationStatus, specialty, organizationId, facilityId, availabilityType }) {
    const { limit: safeLimit, offset, page: safePage } = toSequelizePage({ page, limit });

    const where = { tenant_uuid: tenantUuid };
    where.status = status ? status : { [Op.ne]: 'DELETED' };
    if (providerType) where.provider_type = providerType;
    if (verificationStatus) where.verification_status = verificationStatus;

    // Each filter that lives on a child table narrows the candidate id set.
    const idSets = [];
    if (search) {
      const like = { [Op.like]: `%${search}%` };
      const byRegistration = await ProviderRegistration.findAll({
        where: { tenant_uuid: tenantUuid, registration_number: like },
        attributes: ['providerId'],
      });
      where[Op.or] = [
        { display_name: like },
        { provider_code: like },
        { email: like },
        { phone_number: like },
        { provider_id: { [Op.in]: byRegistration.map((r) => r.providerId) } },
      ];
    }
    if (specialty) {
      const rows = await ProviderSpecialty.findAll({ where: { specialty_name: { [Op.like]: `%${specialty}%` } }, attributes: ['providerId'] });
      idSets.push(rows.map((r) => r.providerId));
    }
    if (organizationId || facilityId || availabilityType) {
      idSets.push(await this.#idsByAffiliation({ tenantUuid, organizationId, facilityId, availabilityType }));
    }
    if (idSets.length) {
      const intersection = idSets.reduce((acc, ids) => acc.filter((id) => ids.includes(id)));
      where.provider_id = { [Op.in]: intersection };
    }

    const sortField = SORTABLE[sortBy] || 'createdOn';
    const result = await Provider.findAndCountAll({
      where,
      limit: safeLimit,
      offset,
      order: [[sortField, sortDir === 'ASC' ? 'ASC' : 'DESC'], ['providerId', 'DESC']],
    });

    const rows = await this.#summaries(result.rows, tenantUuid);
    return buildEnvelope({ rows, count: result.count }, { page: safePage, limit: safeLimit });
  }

  /** List rows: profile headline + a compact view of where the provider practises. */
  async #summaries(providers, tenantUuid) {
    const ids = providers.map((p) => p.providerId);
    if (!ids.length) return [];

    const [specialties, registrations, affiliations] = await Promise.all([
      ProviderSpecialty.findAll({ where: { provider_id: { [Op.in]: ids } } }),
      ProviderRegistration.findAll({ where: { provider_id: { [Op.in]: ids } } }),
      ProviderAffiliation.findAll({ where: { provider_id: { [Op.in]: ids }, tenant_uuid: tenantUuid, status: 'ACTIVE' } }),
    ]);
    const group = (list) => {
      const map = new Map();
      for (const item of list) {
        if (!map.has(item.providerId)) map.set(item.providerId, []);
        map.get(item.providerId).push(item);
      }
      return map;
    };
    const specialtiesBy = group(specialties);
    const registrationsBy = group(registrations);
    const affiliationsBy = group(affiliations);

    return providers.map((provider) => {
      const p = plainOf(provider);
      const specs = specialtiesBy.get(p.providerId) || [];
      const regs = registrationsBy.get(p.providerId) || [];
      const affs = affiliationsBy.get(p.providerId) || [];
      const primarySpecialty = specs.find((s) => s.specialtyLevel === 'PRIMARY') || specs[0];
      const primaryRegistration = regs.find((r) => r.isPrimary) || regs[0];
      return {
        providerId: p.providerId,
        providerUuid: p.providerUuid,
        providerCode: p.providerCode,
        displayName: p.displayName,
        providerType: p.providerType,
        systemOfMedicine: p.systemOfMedicine,
        gender: p.gender,
        email: p.email,
        phoneCountryCode: p.phoneCountryCode,
        phoneNumber: p.phoneNumber,
        photoUrl: p.photoUrl,
        primarySpecialty: primarySpecialty?.specialtyName ?? null,
        registrationNumber: primaryRegistration ? `${primaryRegistration.registrationBody} ${primaryRegistration.registrationNumber}` : null,
        experienceYears: yearsSince(p.practiceStartDate),
        verificationStatus: p.verificationStatus,
        status: p.status,
        affiliationCount: affs.length,
        organizationCount: new Set(affs.map((a) => a.organizationId)).size,
        facilityCount: new Set(affs.filter((a) => a.facilityId).map((a) => a.facilityId)).size,
        availabilityTypes: [...new Set(affs.map((a) => a.availabilityType))],
        createdOn: p.createdOn,
        modifiedOn: p.modifiedOn,
      };
    });
  }

  /** ACTIVE providers for pickers (e.g. when attaching a doctor to a slot schedule). */
  async getDropdownList({ tenantUuid, facilityId, organizationId }) {
    const where = { tenant_uuid: tenantUuid, status: 'ACTIVE' };
    if (facilityId || organizationId) {
      const ids = await this.#idsByAffiliation({ tenantUuid, organizationId, facilityId });
      where.provider_id = { [Op.in]: ids };
    }
    const providers = await Provider.findAll({ where, order: [['displayName', 'ASC']], limit: 1000 });
    const summaries = await this.#summaries(providers, tenantUuid);
    return {
      data: summaries.map((s) => ({
        providerId: s.providerId,
        providerCode: s.providerCode,
        displayName: s.displayName,
        providerType: s.providerType,
        primarySpecialty: s.primarySpecialty,
      })),
    };
  }

  async update(providerId, rawPatch, ctx) {
    const { tenantUuid, userId } = ctx;
    const provider = await Provider.findOne({ where: { provider_id: providerId, tenant_uuid: tenantUuid }, include: CHILD_INCLUDES });
    if (!provider) throw providerNotFound();
    if (provider.status === 'DELETED') throw httpError(409, 'PROVIDER_DELETED', 'A deleted provider cannot be edited');

    const patch = normalizeCollections(rawPatch);
    const providerType = patch.providerType ?? provider.providerType;

    // Same cross-row rules as create, applied to the effective state.
    const effectiveRegistrations = patch.registrations ?? provider.registrations.map((r) => stripChild(plainOf(r)));
    const shapeError = validateProfileShape({
      providerType,
      registrations: effectiveRegistrations,
      specialties: patch.specialties,
      experiences: patch.experiences,
    });
    if (shapeError) throw httpError(400, 'INVALID_PROVIDER', shapeError);
    if (patch.registrations) await findDuplicateRegistration(tenantUuid, patch.registrations, { excludeProviderId: providerId });

    const changes = {};
    for (const field of PROFILE_FIELDS) if (patch[field] !== undefined) changes[field] = blankToNull(patch[field]);
    Object.assign(changes, await resolveGeoColumns(patch, provider, ctx));
    // Re-derive the display name only when a name part changed and the caller
    // didn't supply their own display name.
    if (patch.displayName === undefined && NAME_PARTS.some((k) => patch[k] !== undefined)) {
      changes.displayName = buildDisplayName({
        title: changes.title !== undefined ? changes.title : provider.title,
        firstName: changes.firstName !== undefined ? changes.firstName : provider.firstName,
        middleName: changes.middleName !== undefined ? changes.middleName : provider.middleName,
        lastName: changes.lastName !== undefined ? changes.lastName : provider.lastName,
      });
    }

    try {
      await sequelize.transaction(async (transaction) => {
        await provider.update({ ...changes, modifiedBy: userId || null, modifiedOn: new Date() }, { transaction });
        await writeChildren(providerId, tenantUuid, patch, transaction);
      });
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        throw httpError(409, 'DUPLICATE_REGISTRATION', 'A provider with one of these registration numbers already exists');
      }
      throw error;
    }
    return this.getById(providerId, ctx);
  }

  async setStatus(providerId, status, { tenantUuid, userId }) {
    const provider = await Provider.findOne({ where: { provider_id: providerId, tenant_uuid: tenantUuid } });
    if (!provider) throw providerNotFound();
    await provider.update({ status, modifiedBy: userId || null, modifiedOn: new Date() });
    return this.getById(providerId, { tenantUuid });
  }

  async verify(providerId, { verificationStatus, remarks }, { tenantUuid, userId }) {
    const provider = await Provider.findOne({ where: { provider_id: providerId, tenant_uuid: tenantUuid } });
    if (!provider) throw providerNotFound();
    if (verificationStatus === 'VERIFIED' && LICENSED_TYPES.includes(provider.providerType)) {
      const registrations = await ProviderRegistration.count({ where: { provider_id: providerId } });
      if (!registrations) throw httpError(409, 'NO_REGISTRATION', 'A licensed provider needs at least one registration before it can be verified');
    }
    await provider.update({
      verificationStatus,
      verificationRemarks: remarks || null,
      verifiedBy: verificationStatus === 'PENDING' ? null : userId || null,
      verifiedOn: verificationStatus === 'PENDING' ? null : new Date(),
      modifiedBy: userId || null,
      modifiedOn: new Date(),
    });
    return this.getById(providerId, { tenantUuid });
  }
}

module.exports = new ProviderService();
