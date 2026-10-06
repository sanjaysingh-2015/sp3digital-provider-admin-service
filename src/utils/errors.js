/** Errors the global handler in app.js turns into { error: { code, message } }. */
function httpError(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.expose = true;
  if (details) error.details = details;
  return error;
}

module.exports = {
  httpError,
  providerNotFound: () => httpError(404, 'PROVIDER_NOT_FOUND', 'Provider not found'),
  affiliationNotFound: () => httpError(404, 'AFFILIATION_NOT_FOUND', 'Provider affiliation not found'),
};
