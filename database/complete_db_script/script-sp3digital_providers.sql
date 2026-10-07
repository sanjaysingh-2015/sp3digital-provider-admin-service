-- =====================================================================
-- sp3digital_providers — Provider (doctor) registry
--
-- Bounded context: the PROVIDER domain. Owns who a provider is
-- (profile, qualifications, council registrations, specialties,
-- languages, experience, documents) and where they practise
-- (affiliations to an organization / facility, each with an availability
-- type: PHYSICAL, REMOTE or OTHER such as ON_DEMAND).
--
-- Cross-database references (organization_id, facility_id, department_id,
-- facility_service_id, user_id) are plain bigint unsigned columns with NO
-- foreign keys, same rule as appointment-admin-service: each domain stays
-- independently deployable. The service validates them against
-- organization-admin-service at write time (see src/clients).
--
-- MySQL 8.0.13+ required (functional index / generated column).
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `sp3digital_providers`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `sp3digital_providers`;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `provider_affiliation_services`;
DROP TABLE IF EXISTS `provider_affiliations`;
DROP TABLE IF EXISTS `provider_documents`;
DROP TABLE IF EXISTS `provider_experiences`;
DROP TABLE IF EXISTS `provider_languages`;
DROP TABLE IF EXISTS `provider_specialties`;
DROP TABLE IF EXISTS `provider_registrations`;
DROP TABLE IF EXISTS `provider_qualifications`;
DROP TABLE IF EXISTS `providers`;
SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================
-- 1. providers — one row per person per tenant
-- =============================================================
CREATE TABLE `providers` (
  `provider_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `provider_uuid` char(36) NOT NULL,
  `tenant_uuid` char(36) NOT NULL,
  `provider_code` varchar(30) DEFAULT NULL,              -- PRV-000123, set right after insert
  `user_id` bigint unsigned DEFAULT NULL,                -- identity-admin-service user, if the provider can log in
  `provider_type` varchar(30) NOT NULL DEFAULT 'DOCTOR', -- DOCTOR / DENTIST / AYUSH_PRACTITIONER / NURSE / MIDWIFE / PHYSIOTHERAPIST / PSYCHOLOGIST / NUTRITIONIST / OTHER
  `system_of_medicine` varchar(30) DEFAULT NULL,         -- ALLOPATHY / AYURVEDA / HOMEOPATHY / UNANI / SIDDHA / YOGA_NATUROPATHY / DENTAL / OTHER

  -- identity
  `title` varchar(20) DEFAULT NULL,                      -- Dr., Prof., ...
  `first_name` varchar(100) NOT NULL,
  `middle_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `display_name` varchar(255) NOT NULL,
  `gender` varchar(20) DEFAULT NULL,                     -- MALE / FEMALE / OTHER / UNDISCLOSED
  `date_of_birth` date DEFAULT NULL,
  `nationality` varchar(60) DEFAULT NULL,
  `photo_url` varchar(500) DEFAULT NULL,
  `bio` text DEFAULT NULL,                               -- public profile summary

  -- contact
  `email` varchar(255) DEFAULT NULL,
  `phone_country_code` varchar(8) DEFAULT NULL,
  `phone_number` varchar(20) DEFAULT NULL,
  `alternate_phone_number` varchar(20) DEFAULT NULL,
  `emergency_contact_name` varchar(150) DEFAULT NULL,
  `emergency_contact_phone` varchar(20) DEFAULT NULL,

  -- address. The *_id columns point into organization-admin-service's geography
  -- tables (cross-database, no FK) — the same ids Organizations and Facilities
  -- store. The name columns are copies the SERVICE fills in from those ids (and
  -- checks that they form a valid country > state > district > sub-district >
  -- city > postal-code chain), so lists and search don't need a geography lookup.
  `address_line1` varchar(255) DEFAULT NULL,
  `address_line2` varchar(255) DEFAULT NULL,
  `country_id` bigint unsigned DEFAULT NULL,
  `state_id` bigint unsigned DEFAULT NULL,
  `district_id` bigint unsigned DEFAULT NULL,
  `sub_district_id` bigint unsigned DEFAULT NULL,
  `city_id` bigint unsigned DEFAULT NULL,
  `postal_code_id` bigint unsigned DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `sub_district_name` varchar(100) DEFAULT NULL,
  `district_name` varchar(100) DEFAULT NULL,
  `state_name` varchar(100) DEFAULT NULL,
  `country_name` varchar(100) DEFAULT NULL,
  `postal_code` varchar(20) DEFAULT NULL,

  -- professional
  `hpr_id` varchar(50) DEFAULT NULL,                     -- ABDM Healthcare Professionals Registry id
  `practice_start_date` date DEFAULT NULL,               -- experience in years is derived from this
  `memberships` text DEFAULT NULL,                       -- professional associations, e.g. IMA
  `awards` text DEFAULT NULL,
  `id_proof_type` varchar(30) DEFAULT NULL,              -- AADHAAR / PAN / PASSPORT / ...
  `id_proof_last4` char(4) DEFAULT NULL,                 -- ONLY the last 4 characters; never store the full number

  -- verification (done by the Tenant Admin after checking documents)
  `verification_status` varchar(20) NOT NULL DEFAULT 'PENDING', -- PENDING / VERIFIED / REJECTED
  `verification_remarks` varchar(500) DEFAULT NULL,
  `verified_by` bigint unsigned DEFAULT NULL,
  `verified_on` datetime(6) DEFAULT NULL,

  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE',        -- ACTIVE / INACTIVE / SUSPENDED / DELETED (soft delete)
  `created_by` bigint unsigned DEFAULT NULL,
  `created_on` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `modified_by` bigint unsigned DEFAULT NULL,
  `modified_on` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`provider_id`),
  UNIQUE KEY `uk_providers_uuid` (`provider_uuid`),
  UNIQUE KEY `uk_providers_tenant_code` (`tenant_uuid`,`provider_code`),
  KEY `idx_providers_tenant_name` (`tenant_uuid`,`display_name`),
  KEY `idx_providers_tenant_status` (`tenant_uuid`,`status`),
  KEY `idx_providers_type` (`provider_type`),
  KEY `idx_providers_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================================
-- 2. provider_registrations — medical council / licence numbers
-- A registration number can exist only once per tenant, which is what
-- stops the same doctor being registered twice: the Tenant Admin finds
-- the existing provider and adds another affiliation instead.
-- =============================================================
CREATE TABLE `provider_registrations` (
  `registration_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `provider_id` bigint unsigned NOT NULL,
  `tenant_uuid` char(36) NOT NULL,
  `registration_body` varchar(100) NOT NULL,             -- NMC / State Medical Council / Dental Council / CCIM / ...
  `registration_number` varchar(60) NOT NULL,
  `registered_state` varchar(100) DEFAULT NULL,
  `issued_on` date DEFAULT NULL,
  `valid_until` date DEFAULT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`registration_id`),
  UNIQUE KEY `uk_registrations_tenant_number` (`tenant_uuid`,`registration_body`,`registration_number`),
  KEY `idx_registrations_provider` (`provider_id`),
  CONSTRAINT `fk_registrations_provider` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`provider_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================================
-- 3. provider_qualifications
-- =============================================================
CREATE TABLE `provider_qualifications` (
  `qualification_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `provider_id` bigint unsigned NOT NULL,
  `degree` varchar(100) NOT NULL,                        -- MBBS, MD, MS, BDS, BAMS, ...
  `specialization` varchar(150) DEFAULT NULL,
  `institution` varchar(200) DEFAULT NULL,
  `university` varchar(200) DEFAULT NULL,
  `country` varchar(100) DEFAULT NULL,
  `year_of_completion` smallint unsigned DEFAULT NULL,
  PRIMARY KEY (`qualification_id`),
  KEY `idx_qualifications_provider` (`provider_id`),
  CONSTRAINT `fk_qualifications_provider` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`provider_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================================
-- 4. provider_specialties
-- =============================================================
CREATE TABLE `provider_specialties` (
  `specialty_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `provider_id` bigint unsigned NOT NULL,
  `specialty_name` varchar(150) NOT NULL,
  `specialty_code` varchar(50) DEFAULT NULL,
  `specialty_level` varchar(20) NOT NULL DEFAULT 'PRIMARY', -- PRIMARY / SECONDARY / SUPER_SPECIALTY (at most one PRIMARY, enforced in the service)
  PRIMARY KEY (`specialty_id`),
  KEY `idx_specialties_provider` (`provider_id`),
  KEY `idx_specialties_name` (`specialty_name`),
  CONSTRAINT `fk_specialties_provider` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`provider_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================================
-- 5. provider_languages — languages the provider consults in
-- =============================================================
CREATE TABLE `provider_languages` (
  `language_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `provider_id` bigint unsigned NOT NULL,
  `language_name` varchar(60) NOT NULL,
  `language_code` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`language_id`),
  UNIQUE KEY `uk_languages_provider_name` (`provider_id`,`language_name`),
  CONSTRAINT `fk_languages_provider` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`provider_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================================
-- 6. provider_experiences — work history
-- =============================================================
CREATE TABLE `provider_experiences` (
  `experience_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `provider_id` bigint unsigned NOT NULL,
  `organization_name` varchar(200) NOT NULL,
  `designation` varchar(100) DEFAULT NULL,
  `department` varchar(100) DEFAULT NULL,
  `location` varchar(150) DEFAULT NULL,
  `from_date` date DEFAULT NULL,
  `to_date` date DEFAULT NULL,
  `is_current` tinyint(1) NOT NULL DEFAULT 0,
  `description` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`experience_id`),
  KEY `idx_experiences_provider` (`provider_id`),
  CONSTRAINT `fk_experiences_provider` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`provider_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================================
-- 7. provider_documents — references to uploaded files (file storage
-- itself is outside this service; file_url is whatever the document
-- store returns).
-- =============================================================
CREATE TABLE `provider_documents` (
  `document_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `provider_id` bigint unsigned NOT NULL,
  `document_type` varchar(40) NOT NULL,                  -- REGISTRATION_CERTIFICATE / DEGREE_CERTIFICATE / ID_PROOF / PHOTO / SIGNATURE / EXPERIENCE_LETTER / OTHER
  `document_name` varchar(150) NOT NULL,
  `file_url` varchar(500) NOT NULL,
  `expires_on` date DEFAULT NULL,
  PRIMARY KEY (`document_id`),
  KEY `idx_documents_provider` (`provider_id`),
  CONSTRAINT `fk_documents_provider` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`provider_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================================
-- 8. provider_affiliations — where and how a provider practises
-- One row per (provider, organization, facility, availability type).
-- The same doctor can therefore be PHYSICAL at one facility, REMOTE at
-- another, and ON_DEMAND at a third, or PHYSICAL and REMOTE at the same
-- facility as two rows with their own fees and channels.
-- facility_id NULL = attached to the organization as a whole.
-- =============================================================
CREATE TABLE `provider_affiliations` (
  `affiliation_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `affiliation_uuid` char(36) NOT NULL,
  `tenant_uuid` char(36) NOT NULL,
  `provider_id` bigint unsigned NOT NULL,
  `organization_id` bigint unsigned NOT NULL,
  `facility_id` bigint unsigned DEFAULT NULL,
  `department_id` bigint unsigned DEFAULT NULL,

  `availability_type` varchar(20) NOT NULL,              -- PHYSICAL / REMOTE / OTHER
  `availability_subtype` varchar(30) NOT NULL DEFAULT '',-- for OTHER: ON_DEMAND / ON_CALL / HOME_VISIT / OUTREACH_CAMP / OTHER
  `designation` varchar(100) DEFAULT NULL,
  `employment_type` varchar(20) DEFAULT NULL,            -- FULL_TIME / PART_TIME / VISITING / CONSULTANT / CONTRACT / HONORARY
  `employee_code` varchar(50) DEFAULT NULL,              -- the facility's own staff id
  `room_or_chamber` varchar(100) DEFAULT NULL,           -- PHYSICAL
  `remote_channels` varchar(60) DEFAULT NULL,            -- REMOTE: comma list of VIDEO,AUDIO,CHAT

  `consultation_fee` decimal(10,2) DEFAULT NULL,
  `follow_up_fee` decimal(10,2) DEFAULT NULL,
  `currency` char(3) NOT NULL DEFAULT 'INR',
  `follow_up_valid_days` smallint unsigned DEFAULT NULL,
  `consultation_duration_minutes` smallint unsigned DEFAULT NULL,
  `accepts_new_patients` tinyint(1) NOT NULL DEFAULT 1,
  `is_primary` tinyint(1) NOT NULL DEFAULT 0,            -- at most one per provider, enforced in the service
  `effective_from` date DEFAULT NULL,
  `effective_to` date DEFAULT NULL,
  `notes` varchar(500) DEFAULT NULL,

  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE',        -- ACTIVE / INACTIVE / SUSPENDED / ENDED
  `created_by` bigint unsigned DEFAULT NULL,
  `created_on` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `modified_by` bigint unsigned DEFAULT NULL,
  `modified_on` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

  -- Makes the unique key below treat "no facility" as a value (MySQL
  -- unique indexes ignore NULLs).
  `facility_key` bigint unsigned GENERATED ALWAYS AS (IFNULL(`facility_id`, 0)) STORED,

  PRIMARY KEY (`affiliation_id`),
  UNIQUE KEY `uk_affiliations_uuid` (`affiliation_uuid`),
  UNIQUE KEY `uk_affiliations_scope` (`provider_id`,`organization_id`,`facility_key`,`availability_type`,`availability_subtype`),
  KEY `idx_affiliations_tenant` (`tenant_uuid`),
  KEY `idx_affiliations_org` (`organization_id`),
  KEY `idx_affiliations_facility` (`facility_id`),
  KEY `idx_affiliations_department` (`department_id`),
  KEY `idx_affiliations_type_status` (`availability_type`,`status`),
  CONSTRAINT `fk_affiliations_provider` FOREIGN KEY (`provider_id`) REFERENCES `providers` (`provider_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================================
-- 9. provider_affiliation_services — which facility services the
-- provider delivers under an affiliation. appointment-admin-service
-- will use this to attach slot configs to a provider.
-- =============================================================
CREATE TABLE `provider_affiliation_services` (
  `affiliation_id` bigint unsigned NOT NULL,
  `facility_service_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`affiliation_id`,`facility_service_id`),
  KEY `idx_affiliation_services_service` (`facility_service_id`),
  CONSTRAINT `fk_affiliation_services_affiliation` FOREIGN KEY (`affiliation_id`) REFERENCES `provider_affiliations` (`affiliation_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
