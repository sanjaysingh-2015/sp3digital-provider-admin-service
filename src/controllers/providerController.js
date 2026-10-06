const providerService = require('../services/providerService');
const affiliationService = require('../services/affiliationService');

const ctxOf = (req) => ({ tenantUuid: req.auth.tenantUuid, userId: req.auth.userId, token: req.auth.rawToken });

// Thin wrappers only — every rule lives in the services.
const handle = (fn) => async (req, res, next) => {
  try {
    const { status, body } = await fn(req);
    return res.status(status).json(body);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  create: handle(async (req) => ({ status: 201, body: await providerService.create(req.body, ctxOf(req)) })),
  getList: handle(async (req) => ({ status: 200, body: await providerService.getList({ ...req.query, tenantUuid: req.auth.tenantUuid }) })),
  getDropdownList: handle(async (req) => ({ status: 200, body: await providerService.getDropdownList({ ...req.query, tenantUuid: req.auth.tenantUuid }) })),
  getById: handle(async (req) => ({ status: 200, body: await providerService.getById(req.params.id, ctxOf(req)) })),
  update: handle(async (req) => ({ status: 200, body: await providerService.update(req.params.id, req.body, ctxOf(req)) })),
  setStatus: handle(async (req) => ({ status: 200, body: await providerService.setStatus(req.params.id, req.body.status, ctxOf(req)) })),
  verify: handle(async (req) => ({ status: 200, body: await providerService.verify(req.params.id, req.body, ctxOf(req)) })),

  // Affiliations nested under a provider
  listAffiliations: handle(async (req) => ({ status: 200, body: { data: await affiliationService.listForProvider(req.params.id, ctxOf(req)) } })),
  createAffiliation: handle(async (req) => ({ status: 201, body: await affiliationService.create(req.params.id, req.body, ctxOf(req)) })),
};
