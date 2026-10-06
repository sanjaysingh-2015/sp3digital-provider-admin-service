module.exports = (sequelize, DataTypes) => {
  const ProviderAffiliation = sequelize.define(
    'ProviderAffiliation',
    {
      affiliationId: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, field: 'affiliation_id' },
      affiliationUuid: { type: DataTypes.UUID, allowNull: false, unique: true, defaultValue: DataTypes.UUIDV4, field: 'affiliation_uuid' },
      tenantUuid: { type: DataTypes.UUID, allowNull: false, field: 'tenant_uuid' },
      providerId: { type: DataTypes.BIGINT, allowNull: false, field: 'provider_id' },
      // organization-admin-service references — cross-database, no FK.
      organizationId: { type: DataTypes.BIGINT, allowNull: false, field: 'organization_id' },
      facilityId: { type: DataTypes.BIGINT, allowNull: true, field: 'facility_id' }, // NULL = the organization as a whole
      departmentId: { type: DataTypes.BIGINT, allowNull: true, field: 'department_id' },

      availabilityType: { type: DataTypes.STRING(20), allowNull: false, field: 'availability_type' }, // PHYSICAL / REMOTE / OTHER
      availabilitySubtype: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '', field: 'availability_subtype' }, // OTHER: ON_DEMAND / ON_CALL / ...
      designation: { type: DataTypes.STRING(100), allowNull: true, field: 'designation' },
      employmentType: { type: DataTypes.STRING(20), allowNull: true, field: 'employment_type' },
      employeeCode: { type: DataTypes.STRING(50), allowNull: true, field: 'employee_code' },
      roomOrChamber: { type: DataTypes.STRING(100), allowNull: true, field: 'room_or_chamber' },
      remoteChannels: { type: DataTypes.STRING(60), allowNull: true, field: 'remote_channels' }, // "VIDEO,AUDIO"

      consultationFee: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'consultation_fee' },
      followUpFee: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'follow_up_fee' },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR', field: 'currency' },
      followUpValidDays: { type: DataTypes.SMALLINT, allowNull: true, field: 'follow_up_valid_days' },
      consultationDurationMinutes: { type: DataTypes.SMALLINT, allowNull: true, field: 'consultation_duration_minutes' },
      acceptsNewPatients: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'accepts_new_patients' },
      isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_primary' },
      effectiveFrom: { type: DataTypes.DATEONLY, allowNull: true, field: 'effective_from' },
      effectiveTo: { type: DataTypes.DATEONLY, allowNull: true, field: 'effective_to' },
      notes: { type: DataTypes.STRING(500), allowNull: true, field: 'notes' },

      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE', field: 'status' },
      createdBy: { type: DataTypes.BIGINT, allowNull: true, field: 'created_by' },
      createdOn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_on' },
      modifiedBy: { type: DataTypes.BIGINT, allowNull: true, field: 'modified_by' },
      modifiedOn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'modified_on' },
    },
    {
      tableName: 'provider_affiliations',
      freezeTableName: true,
      timestamps: false,
      indexes: [
        { fields: ['tenant_uuid'] },
        { fields: ['organization_id'] },
        { fields: ['facility_id'] },
        { fields: ['availability_type', 'status'] },
      ],
    },
  );

  return ProviderAffiliation;
};
