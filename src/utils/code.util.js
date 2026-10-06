/** PRV-000123 — derived from the row id, so it is unique without a counter table. */
function providerCode(providerId) {
  return `PRV-${String(providerId).padStart(6, '0')}`;
}

/** Whole years between a date (YYYY-MM-DD or Date) and today; null when unknown. */
function yearsSince(dateValue, now = new Date()) {
  if (!dateValue) return null;
  const start = new Date(dateValue);
  if (Number.isNaN(start.getTime())) return null;
  let years = now.getUTCFullYear() - start.getUTCFullYear();
  const beforeAnniversary =
    now.getUTCMonth() < start.getUTCMonth() ||
    (now.getUTCMonth() === start.getUTCMonth() && now.getUTCDate() < start.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(years, 0);
}

module.exports = { providerCode, yearsSince };
