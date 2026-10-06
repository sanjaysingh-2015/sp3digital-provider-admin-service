const { Op } = require('sequelize');
const { sequelize, Provider, ProviderAffiliation, ProviderAffiliationService } = require('../models');
const { toSequelizePage, buildEnvelope } = require('../utils/pagination');
const { httpError, providerNotFound, affiliationNotFound } = require('../utils/errors');
const { validateAffiliationShape } = require('../validations/affiliation.validation');
const { validateReferences } = require('../clients/organizationDirectory');

const SERVICES_INCLUDE = { model: ProviderAffiliationService, as: 'services', attributes: ['facilityServiceId'] };
const PROVIDER_INCLUDE = {
  model: Provider,
  as: 'provider',
  attributes: ['providerId', 'providerCode', 'displayName', 'providerType', 'status', 'verificationStatus'],
};

const splitChannels = (value) => (value ? value.split(',').filter(Boolean) : []);
const joinChannels = (channels) => (channels && channels.length ? channels.join(',') : null);
const money = (value) => (value === null || value === undefined ? null : Number(value));

function toResponse(row, { withProvider = false } = {}) {
  if (!row) return null;
  const plain = row.get ? row.get({ plain: true }) : row;
  return {
    affiliationId: plain.affiliationId,
    affiliationUuid: plain.affiliationUuid,
    providerId: plain.providerId,
    ...(withProvider && plain.provider
      ? {
          provider: {
            providerId: plain.provider.providerId,
            providerCode: plain.provider.providerCode,
            displayName: plain.provider.displayName,
            providerType: plain.provider.providerType,
            status: plain.provider.status,
            verificationStatus: plain.provider.verificationStatus,
          },
        }
      : {}),
    organizationId: plain.organizationId,
    facilityId: plain.facilityId,
    departmentId: plain.departmentId,
    availabilityType: plain.availabilityType,
    availabilitySubtype: plain.availabilitySubtype || null,
    designation: plain.designation,
    employmentType: plain.employmentType,
    employeeCode: plain.employeeCode,
    roomOrChamber: plain.roomOrChamber,
    remoteChannels: splitChannels(plain.remoteChannels),
    consultationFee: money(plain.consultationFee),
    followUpFee: money(plain.followUpFee),
    currency: plain.currency,
    followUpValidDays: plain.followUpValidDays,
    consultationDurationMinutes: plain.consultationDurationMinutes,
    acceptsNewPatients: !!plain.acceptsNewPatients,
    isPrimary: !!plain.isPrimary,
    effectiveFrom: plain.effectiveFrom,
    effectiveTo: plain.effectiveTo,
    notes: plain.notes,
    facilityServiceIds: (plain.services || []).map((s) => s.facilityServiceId),
    status: plain.status,
    createdBy: plain.createdBy,
    createdOn: plain.createdOn,
    modifiedBy: plain.modifiedBy,
    modifiedOn: plain.modifiedOn,
  };
}

async function assertNoDuplicate(scope, { transaction, excludeAffiliationId } = {}) {
  const where = {
    provider_id: scope.providerId,
    organization_id: scope.organizationId,
    facility_id: scope.facilityId ?? null,
    availability_type: scope.availabilityType,
    availability_subtype: scope.availabilitySubtype || '',
    status: { [Op.ne]: 'ENDED' },
  };
  if (excludeAffiliationId) where.affiliation_id = { [Op.ne]: excludeAffiliationId };
  const existing = await ProviderAffiliation.findOne({ where, transaction });
  if (existing) {
    throw httpError(
      409,
      'DUPLICATE_AFFILIATION',
      'This provider already has an active affiliation with the same organization, facility and availability type. Edit that one instead.',
    );
  }
}

async function clearOtherPrimaries(providerId, exceptAffiliationId, transaction) {
  const where = { provider_id: providerId, is_primary: true };
  if (exceptAffiliationId) where.affiliation_id = { [Op.ne]: exceptAffiliationId };
  await ProviderAffiliation.update({ isPrimary: false }, { where, transaction });
}

class AffiliationService {
  /** Used by providerService.create (inside its transaction) and by create() below. */
  async createInTransaction(provider, payload, { tenantUuid, userId }, transaction) {
    const scope = { ...payload, providerId: provider.providerId };
    await assertNoDuplicate(scope, { transaction });

    const hasAny = await ProviderAffiliation.count({ where: { provider_id: provider.providerId }, transaction });
    const isPrimary = payload.isPrimary ?? hasAny === 0;
    if (isPrimary) await clearOtherPrimaries(provider.providerId, null, transaction);

    const affiliation = await ProviderAffiliation.create(
      {
        tenantUuid,
        providerId: provider.providerId,
        organizationId: payload.organizationId,
        facilityId: payload.facilityId ?? null,
        departmentId: payload.departmentId ?? null,
        availabilityType: payload.availabilityType,
        availabilitySubtype: payload.availabilitySubtype || '',
        designation: payload.designation || null,
        employmentType: payload.employmentType || null,
        employeeCode: payload.employeeCode || null,
        roomOrChamber: payload.roomOrChamber || null,
        remoteChannels: joinChannels(payload.remoteChannels),
        consultationFee: payload.consultationFee ?? null,
        followUpFee: payload.followUpFee ?? null,
        currency: payload.currency || 'INR',
        followUpValidDays: payload.followUpValidDays ?? null,
        consultationDurationMinutes: payload.consultationDurationMinutes ?? null,
        acceptsNewPatients: payload.acceptsNewPatients ?? true,
        isPrimary,
        effectiveFrom: payload.effectiveFrom ?? null,
        effectiveTo: payload.effectiveTo ?? null,
        notes: payload.notes || null,
        status: 'ACTIVE',
        createdBy: userId || null,
        modifiedBy: userId || null,
      },
      { transaction },
    );

    if (payload.facilityServiceIds?.length) {
      await ProviderAffiliationService.bulkCreate(
        payload.facilityServiceIds.map((facilityServiceId) => ({ affiliationId: affiliation.affiliationId, facilityServiceId })),
        { transaction },
      );
    }
    return affiliation;
  }

  async create(providerId, payload, ctx) {
    const provider = await Provider.findOne({ where: { provider_id: providerId, tenant_uuid: ctx.tenantUuid } });
    if (!provider) throw providerNotFound();
    if (provider.status === 'DELETED') {
      throw httpError(409, 'PROVIDER_DELETED', 'A deleted provider cannot be given new affiliations');
    }

    await validateReferences({ token: ctx.token, ...payload });

    const affiliationId = await sequelize.transaction(async (transaction) => {
      const affiliation = await this.createInTransaction(provider, payload, ctx, transaction);
      return affiliation.affiliationId;
    });
    return this.getById(affiliationId, ctx);
  }

  async getById(affiliationId, { tenantUuid }) {
    const row = await ProviderAffiliation.findOne({
      where: { affiliation_id: affiliationId, tenant_uuid: tenantUuid },
      include: [SERVICES_INCLUDE, PROVIDER_INCLUDE],
    });
    if (!row) throw affiliationNotFound();
    return toResponse(row, { withProvider: true });
  }

  async listForProvider(providerId, { tenantUuid }) {
    const provider = await Provider.findOne({ where: { provider_id: providerId, tenant_uuid: tenantUuid }, attributes: ['providerId'] });
    if (!provider) throw providerNotFound();
    const rows = await ProviderAffiliation.findAll({
      where: { provider_id: providerId },
      include: [SERVICES_INCLUDE],
      order: [['isPrimary', 'DESC'], ['createdOn', 'ASC']],
    });
    return rows.map((row) => toResponse(row));
  }

  async getList({ page, limit, tenantUuid, providerId, organizationId, facilityId, departmentId, facilityServiceId, availabilityType, status }) {
    const { limit: safeLimit, offset, page: safePage } = toSequelizePage({ page, limit });

    const where = { tenant_uuid: tenantUuid };
    if (providerId) where.provider_id = providerId;
    if (organizationId) where.organization_id = organizationId;
    if (facilityId) where.facility_id = facilityId;
    if (departmentId) where.department_id = departmentId;
    if (availabilityType) where.availability_type = availabilityType;
    if (status) where.status = status;

    if (facilityServiceId) {
      const links = await ProviderAffiliationService.findAll({ where: { facility_service_id: facilityServiceId }, attributes: ['affiliationId'] });
      where.affiliation_id = { [Op.in]: links.map((l) => l.affiliationId) };
    }

    const result = await ProviderAffiliation.findAndCountAll({
      where,
      include: [PROVIDER_INCLUDE],
      limit: safeLimit,
      offset,
      order: [['createdOn', 'DESC']],
      distinct: true,
    });

    // Services are fetched in one extra query rather than as a JOIN, so the
    // page size stays honest (a JOIN would multiply rows per service).
    const ids = result.rows.map((r) => r.affiliationId);
    const links = ids.length
      ? await ProviderAffiliationService.findAll({ where: { affiliation_id: { [Op.in]: ids } } })
      : [];
    const byAffiliation = new Map();
    for (const link of links) {
      if (!byAffiliation.has(link.affiliationId)) byAffiliation.set(link.affiliationId, []);
      byAffiliation.get(link.affiliationId).push({ facilityServiceId: link.facilityServiceId });
    }
    const rows = result.rows.map((row) => {
      const plain = row.get({ plain: true });
      plain.services = byAffiliation.get(plain.affiliationId) || [];
      return toResponse(plain, { withProvider: true });
    });

    return buildEnvelope({ rows, count: result.count }, { page: safePage, limit: safeLimit });
  }

  /** PATCH: merge onto the stored row, then validate the EFFECTIVE state. */
  async update(affiliationId, patch, ctx) {
    const existing = await ProviderAffiliation.findOne({
      where: { affiliation_id: affiliationId, tenant_uuid: ctx.tenantUuid },
      include: [SERVICES_INCLUDE],
    });
    if (!existing) throw affiliationNotFound();
    if (existing.status === 'ENDED' && patch.status !== 'ACTIVE') {
      throw httpError(409, 'AFFILIATION_ENDED', 'An ended affiliation cannot be edited; re-activate it first or create a new one');
    }

    const has = (key) => Object.prototype.hasOwnProperty.call(patch, key);
    const effective = {
      organizationId: patch.organizationId ?? existing.organizationId,
      facilityId: has('facilityId') ? patch.facilityId : existing.facilityId,
      departmentId: has('departmentId') ? patch.departmentId : existing.departmentId,
      availabilityType: patch.availabilityType ?? existing.availabilityType,
      availabilitySubtype: has('availabilitySubtype') ? patch.availabilitySubtype : existing.availabilitySubtype,
      remoteChannels: has('remoteChannels') ? patch.remoteChannels : splitChannels(existing.remoteChannels),
      roomOrChamber: has('roomOrChamber') ? patch.roomOrChamber : existing.roomOrChamber,
      facilityServiceIds: has('facilityServiceIds') ? patch.facilityServiceIds : existing.services.map((s) => s.facilityServiceId),
      effectiveFrom: has('effectiveFrom') ? patch.effectiveFrom : existing.effectiveFrom,
      effectiveTo: has('effectiveTo') ? patch.effectiveTo : existing.effectiveTo,
    };

    // Switching the availability type drops whatever no longer applies, so the
    // caller doesn't have to null each field out in the same request.
    if (patch.availabilityType && patch.availabilityType !== existing.availabilityType) {
      if (patch.availabilityType !== 'REMOTE' && !has('remoteChannels')) effective.remoteChannels = [];
      if (patch.availabilityType !== 'PHYSICAL' && !has('roomOrChamber')) effective.roomOrChamber = null;
      if (patch.availabilityType !== 'OTHER' && !has('availabilitySubtype')) effective.availabilitySubtype = '';
    }
    // Moving to organization-wide (no facility) drops the facility-level links.
    if (has('facilityId') && !patch.facilityId) {
      if (!has('departmentId')) effective.departmentId = null;
      if (!has('facilityServiceIds')) effective.facilityServiceIds = [];
    }

    const shapeError = validateAffiliationShape(effective);
    if (shapeError) throw httpError(400, 'INVALID_AFFILIATION', shapeError);

    const scopeChanged =
      Number(effective.organizationId) !== Number(existing.organizationId) ||
      (effective.facilityId ?? null) !== (existing.facilityId ?? null) ||
      effective.availabilityType !== existing.availabilityType ||
      (effective.availabilitySubtype || '') !== (existing.availabilitySubtype || '');
    const referencesChanged =
      scopeChanged ||
      (effective.departmentId ?? null) !== (existing.departmentId ?? null) ||
      has('facilityServiceIds');

    if (referencesChanged) await validateReferences({ token: ctx.token, ...effective });

    await sequelize.transaction(async (transaction) => {
      if (scopeChanged || patch.status === 'ACTIVE') {
        await assertNoDuplicate({ providerId: existing.providerId, ...effective }, { transaction, excludeAffiliationId: existing.affiliationId });
      }
      if (patch.isPrimary) await clearOtherPrimaries(existing.providerId, existing.affiliationId, transaction);

      const { facilityServiceIds, remoteChannels, ...columns } = patch;
      await existing.update(
        {
          ...columns,
          organizationId: effective.organizationId,
          facilityId: effective.facilityId ?? null,
          departmentId: effective.departmentId ?? null,
          availabilitySubtype: effective.availabilitySubtype || '',
          roomOrChamber: effective.roomOrChamber || null,
          remoteChannels: joinChannels(effective.remoteChannels),
          modifiedBy: ctx.userId || null,
          modifiedOn: new Date(),
        },
        { transaction },
      );

      if (has('facilityServiceIds') || (has('facilityId') && !patch.facilityId)) {
        await ProviderAffiliationService.destroy({ where: { affiliation_id: existing.affiliationId }, transaction });
        if (effective.facilityServiceIds.length) {
          await ProviderAffiliationService.bulkCreate(
            effective.facilityServiceIds.map((id) => ({ affiliationId: existing.affiliationId, facilityServiceId: id })),
            { transaction },
          );
        }
      }
    });

    return this.getById(affiliationId, ctx);
  }

  async setStatus(affiliationId, status, ctx) {
    const existing = await ProviderAffiliation.findOne({ where: { affiliation_id: affiliationId, tenant_uuid: ctx.tenantUuid } });
    if (!existing) throw affiliationNotFound();

    if (status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      await assertNoDuplicate({ ...existing.get({ plain: true }) }, { excludeAffiliationId: existing.affiliationId });
    }
    const changes = { status, modifiedBy: ctx.userId || null, modifiedOn: new Date() };
    // Ending an affiliation closes its validity window if one wasn't set.
    if (status === 'ENDED' && !existing.effectiveTo) changes.effectiveTo = new Date().toISOString().slice(0, 10);
    await existing.update(changes);
    return this.getById(affiliationId, ctx);
  }
}

module.exports = new AffiliationService();
module.exports.toResponse = toResponse;
