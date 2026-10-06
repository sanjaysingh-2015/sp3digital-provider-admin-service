const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Provider = require('./provider.model')(sequelize, DataTypes);
const ProviderRegistration = require('./providerRegistration.model')(sequelize, DataTypes);
const ProviderQualification = require('./providerQualification.model')(sequelize, DataTypes);
const ProviderSpecialty = require('./providerSpecialty.model')(sequelize, DataTypes);
const ProviderLanguage = require('./providerLanguage.model')(sequelize, DataTypes);
const ProviderExperience = require('./providerExperience.model')(sequelize, DataTypes);
const ProviderDocument = require('./providerDocument.model')(sequelize, DataTypes);
const ProviderAffiliation = require('./providerAffiliation.model')(sequelize, DataTypes);
const ProviderAffiliationService = require('./providerAffiliationService.model')(sequelize, DataTypes);

// Everything inside this database is a real, enforced FK (matches the
// CONSTRAINTs in database/complete_db_script). Only the cross-database ids
// (organization / facility / department / facility service / user) are plain
// columns.
const CHILDREN = [
  [ProviderRegistration, 'registrations'],
  [ProviderQualification, 'qualifications'],
  [ProviderSpecialty, 'specialties'],
  [ProviderLanguage, 'languages'],
  [ProviderExperience, 'experiences'],
  [ProviderDocument, 'documents'],
  [ProviderAffiliation, 'affiliations'],
];
for (const [Model, alias] of CHILDREN) {
  Provider.hasMany(Model, { as: alias, foreignKey: 'providerId', onDelete: 'CASCADE' });
  Model.belongsTo(Provider, { as: 'provider', foreignKey: 'providerId' });
}

ProviderAffiliation.hasMany(ProviderAffiliationService, { as: 'services', foreignKey: 'affiliationId', onDelete: 'CASCADE' });
ProviderAffiliationService.belongsTo(ProviderAffiliation, { as: 'affiliation', foreignKey: 'affiliationId' });

module.exports = {
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
};
