module.exports = (sequelize, DataTypes) => {
  const ProviderExperience = sequelize.define(
    'ProviderExperience',
    {
      experienceId: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, field: 'experience_id' },
      providerId: { type: DataTypes.BIGINT, allowNull: false, field: 'provider_id' },
      organizationName: { type: DataTypes.STRING(200), allowNull: false, field: 'organization_name' },
      designation: { type: DataTypes.STRING(100), allowNull: true, field: 'designation' },
      department: { type: DataTypes.STRING(100), allowNull: true, field: 'department' },
      location: { type: DataTypes.STRING(150), allowNull: true, field: 'location' },
      fromDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'from_date' },
      toDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'to_date' },
      isCurrent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_current' },
      description: { type: DataTypes.STRING(500), allowNull: true, field: 'description' },
    },
    {
      tableName: 'provider_experiences',
      freezeTableName: true,
      timestamps: false,
      indexes: [{ fields: ['provider_id'] }],
    },
  );

  return ProviderExperience;
};
