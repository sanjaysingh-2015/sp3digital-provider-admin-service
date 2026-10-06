module.exports = (sequelize, DataTypes) => {
  const str = (field, length, extra = {}) => ({ type: DataTypes.STRING(length), allowNull: true, field, ...extra });

  const Provider = sequelize.define(
    'Provider',
    {
      providerId: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, field: 'provider_id' },
      providerUuid: { type: DataTypes.UUID, allowNull: false, unique: true, defaultValue: DataTypes.UUIDV4, field: 'provider_uuid' },
      tenantUuid: { type: DataTypes.UUID, allowNull: false, field: 'tenant_uuid' },
      providerCode: str('provider_code', 30),
      userId: { type: DataTypes.BIGINT, allowNull: true, field: 'user_id' }, // identity-admin-service user — cross-database, no FK
      providerType: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'DOCTOR', field: 'provider_type' },
      systemOfMedicine: str('system_of_medicine', 30),

      title: str('title', 20),
      firstName: { type: DataTypes.STRING(100), allowNull: false, field: 'first_name' },
      middleName: str('middle_name', 100),
      lastName: str('last_name', 100),
      displayName: { type: DataTypes.STRING(255), allowNull: false, field: 'display_name' },
      gender: str('gender', 20),
      dateOfBirth: { type: DataTypes.DATEONLY, allowNull: true, field: 'date_of_birth' },
      nationality: str('nationality', 60),
      photoUrl: str('photo_url', 500),
      bio: { type: DataTypes.TEXT, allowNull: true, field: 'bio' },

      email: str('email', 255),
      phoneCountryCode: str('phone_country_code', 8),
      phoneNumber: str('phone_number', 20),
      alternatePhoneNumber: str('alternate_phone_number', 20),
      emergencyContactName: str('emergency_contact_name', 150),
      emergencyContactPhone: str('emergency_contact_phone', 20),

      addressLine1: str('address_line1', 255),
      addressLine2: str('address_line2', 255),
      city: str('city', 100),
      subDistrictName: str('sub_district_name', 100),
      districtName: str('district_name', 100),
      stateName: str('state_name', 100),
      countryName: str('country_name', 100),
      postalCode: str('postal_code', 20),

      hprId: str('hpr_id', 50),
      practiceStartDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'practice_start_date' },
      memberships: { type: DataTypes.TEXT, allowNull: true, field: 'memberships' },
      awards: { type: DataTypes.TEXT, allowNull: true, field: 'awards' },
      idProofType: str('id_proof_type', 30),
      idProofLast4: str('id_proof_last4', 4),

      verificationStatus: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING', field: 'verification_status' },
      verificationRemarks: str('verification_remarks', 500),
      verifiedBy: { type: DataTypes.BIGINT, allowNull: true, field: 'verified_by' },
      verifiedOn: { type: DataTypes.DATE, allowNull: true, field: 'verified_on' },

      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE', field: 'status' },
      createdBy: { type: DataTypes.BIGINT, allowNull: true, field: 'created_by' },
      createdOn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_on' },
      modifiedBy: { type: DataTypes.BIGINT, allowNull: true, field: 'modified_by' },
      modifiedOn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'modified_on' },
    },
    {
      tableName: 'providers',
      freezeTableName: true,
      timestamps: false,
      indexes: [
        { fields: ['tenant_uuid', 'display_name'] },
        { fields: ['tenant_uuid', 'status'] },
        { fields: ['provider_type'] },
      ],
    },
  );

  return Provider;
};
