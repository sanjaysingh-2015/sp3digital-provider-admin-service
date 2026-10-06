module.exports = (sequelize, DataTypes) => {
  const ProviderDocument = sequelize.define(
    'ProviderDocument',
    {
      documentId: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, field: 'document_id' },
      providerId: { type: DataTypes.BIGINT, allowNull: false, field: 'provider_id' },
      documentType: { type: DataTypes.STRING(40), allowNull: false, field: 'document_type' },
      documentName: { type: DataTypes.STRING(150), allowNull: false, field: 'document_name' },
      fileUrl: { type: DataTypes.STRING(500), allowNull: false, field: 'file_url' },
      expiresOn: { type: DataTypes.DATEONLY, allowNull: true, field: 'expires_on' },
    },
    {
      tableName: 'provider_documents',
      freezeTableName: true,
      timestamps: false,
      indexes: [{ fields: ['provider_id'] }],
    },
  );

  return ProviderDocument;
};
