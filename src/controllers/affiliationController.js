const affiliationService = require('../services/affiliationService');

const ctxOf = (req) => ({ tenantUuid: req.auth.tenantUuid, userId: req.auth.userId, token: req.auth.rawToken });

const handle = (fn) => async (req, res, next) => {
  try {
    return res.status(200).json(await fn(req));
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getList: handle((req) => affiliationService.getList({ ...req.query, tenantUuid: req.auth.tenantUuid })),
  getById: handle((req) => affiliationService.getById(req.params.id, ctxOf(req))),
  update: handle((req) => affiliationService.update(req.params.id, req.body, ctxOf(req))),
  setStatus: handle((req) => affiliationService.setStatus(req.params.id, req.body.status, ctxOf(req))),
};
