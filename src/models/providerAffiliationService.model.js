module.exports = (sequelize, DataTypes) => {
  const ProviderAffiliationService = sequelize.define(
    'ProviderAffiliationService',
    {
      affiliationId: { type: DataTypes.BIGINT, primaryKey: true, allowNull: false, field: 'affiliation_id' },
      // organization-admin-service facility_service_id — cross-database, no FK.
      facilityServiceId: { type: DataTypes.BIGINT, primaryKey: true, allowNull: false, field: 'facility_service_id' },
    },
    { tableName: 'provider_affiliation_services', freezeTableName: true, timestamps: false },
  );

  return ProviderAffiliationService;
};
