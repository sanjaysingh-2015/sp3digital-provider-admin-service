-- Provider address now uses the shared geography reference data (same ids as
-- Organizations / Facilities). Run once on databases created before this change.
-- Existing free-text name columns are kept; the service refills them from the ids.
USE `sp3digital_providers`;

ALTER TABLE `providers`
  ADD COLUMN `country_id` bigint unsigned DEFAULT NULL AFTER `address_line2`,
  ADD COLUMN `state_id` bigint unsigned DEFAULT NULL AFTER `country_id`,
  ADD COLUMN `district_id` bigint unsigned DEFAULT NULL AFTER `state_id`,
  ADD COLUMN `sub_district_id` bigint unsigned DEFAULT NULL AFTER `district_id`,
  ADD COLUMN `city_id` bigint unsigned DEFAULT NULL AFTER `sub_district_id`,
  ADD COLUMN `postal_code_id` bigint unsigned DEFAULT NULL AFTER `city_id`;
