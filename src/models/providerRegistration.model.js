module.exports = (sequelize, DataTypes) => {
  const ProviderRegistration = sequelize.define(
    'ProviderRegistration',
    {
      registrationId: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, field: 'registration_id' },
      providerId: { type: DataTypes.BIGINT, allowNull: false, field: 'provider_id' },
      tenantUuid: { type: DataTypes.UUID, allowNull: false, field: 'tenant_uuid' },
      registrationBody: { type: DataTypes.STRING(100), allowNull: false, field: 'registration_body' },
      registrationNumber: { type: DataTypes.STRING(60), allowNull: false, field: 'registration_number' },
      registeredState: { type: DataTypes.STRING(100), allowNull: true, field: 'registered_state' },
      issuedOn: { type: DataTypes.DATEONLY, allowNull: true, field: 'issued_on' },
      validUntil: { type: DataTypes.DATEONLY, allowNull: true, field: 'valid_until' },
      isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_primary' },
    },
    {
      tableName: 'provider_registrations',
      freezeTableName: true,
      timestamps: false,
      indexes: [{ fields: ['provider_id'] }],
    },
  );

  return ProviderRegistration;
};
