-- Forward rollback for migration 005.
-- Run only after application CANONICAL_INCIDENT_FIELDS=false is deployed and a backup is verified.
-- This rollback intentionally leaves every pre-005 column untouched.

USE incident_management_db;

ALTER TABLE incidents DROP CHECK chk_incidents_utc_order;
ALTER TABLE incidents DROP CHECK chk_incidents_mttr_nonnegative;
ALTER TABLE incidents DROP CHECK chk_incidents_mttd_nonnegative;
ALTER TABLE incidents DROP CHECK chk_incidents_downtime_nonnegative;

ALTER TABLE incidents DROP INDEX idx_incidents_project_opened_utc;
ALTER TABLE incidents DROP INDEX idx_incidents_closed_at_utc;
ALTER TABLE incidents DROP INDEX idx_incidents_status_opened_utc;
ALTER TABLE incidents DROP INDEX idx_incidents_customer_opened_utc;
ALTER TABLE incidents DROP INDEX idx_incidents_sf_case_no;

DROP TABLE IF EXISTS incident_legacy_metadata;

ALTER TABLE incidents
  DROP COLUMN mttr_minutes,
  DROP COLUMN sla_minutes,
  DROP COLUMN source_timezone,
  DROP COLUMN closed_at_utc,
  DROP COLUMN opened_at_utc;

DELETE FROM schema_migrations WHERE version = '005_incident_canonical_normalization';
