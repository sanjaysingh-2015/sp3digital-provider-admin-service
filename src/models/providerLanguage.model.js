module.exports = (sequelize, DataTypes) => {
  const ProviderLanguage = sequelize.define(
    'ProviderLanguage',
    {
      languageId: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, field: 'language_id' },
      providerId: { type: DataTypes.BIGINT, allowNull: false, field: 'provider_id' },
      languageName: { type: DataTypes.STRING(60), allowNull: false, field: 'language_name' },
      languageCode: { type: DataTypes.STRING(10), allowNull: true, field: 'language_code' },
    },
    {
      tableName: 'provider_languages',
      freezeTableName: true,
      timestamps: false,
      indexes: [{ fields: ['provider_id'] }],
    },
  );

  return ProviderLanguage;
};
