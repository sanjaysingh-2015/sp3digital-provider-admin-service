module.exports = (sequelize, DataTypes) => {
  const ProviderQualification = sequelize.define(
    'ProviderQualification',
    {
      qualificationId: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, field: 'qualification_id' },
      providerId: { type: DataTypes.BIGINT, allowNull: false, field: 'provider_id' },
      degree: { type: DataTypes.STRING(100), allowNull: false, field: 'degree' },
      specialization: { type: DataTypes.STRING(150), allowNull: true, field: 'specialization' },
      institution: { type: DataTypes.STRING(200), allowNull: true, field: 'institution' },
      university: { type: DataTypes.STRING(200), allowNull: true, field: 'university' },
      country: { type: DataTypes.STRING(100), allowNull: true, field: 'country' },
      yearOfCompletion: { type: DataTypes.SMALLINT, allowNull: true, field: 'year_of_completion' },
    },
    {
      tableName: 'provider_qualifications',
      freezeTableName: true,
      timestamps: false,
      indexes: [{ fields: ['provider_id'] }],
    },
  );

  return ProviderQualification;
};
