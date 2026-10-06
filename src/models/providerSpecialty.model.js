module.exports = (sequelize, DataTypes) => {
  const ProviderSpecialty = sequelize.define(
    'ProviderSpecialty',
    {
      specialtyId: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, field: 'specialty_id' },
      providerId: { type: DataTypes.BIGINT, allowNull: false, field: 'provider_id' },
      specialtyName: { type: DataTypes.STRING(150), allowNull: false, field: 'specialty_name' },
      specialtyCode: { type: DataTypes.STRING(50), allowNull: true, field: 'specialty_code' },
      specialtyLevel: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PRIMARY', field: 'specialty_level' },
    },
    {
      tableName: 'provider_specialties',
      freezeTableName: true,
      timestamps: false,
      indexes: [{ fields: ['provider_id'] }],
    },
  );

  return ProviderSpecialty;
};
