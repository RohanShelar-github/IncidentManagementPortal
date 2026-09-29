-- Adds "On Hold" as a fourth environment stage alongside Production, UAT,
-- and Development. A plain MODIFY COLUMN is naturally idempotent (re-running
-- it with the same target definition is a no-op), unlike the conditional
-- ADD COLUMN pattern used to create the column in migration 043. Existing
-- customers' stages are unaffected — MySQL preserves an ENUM column's
-- existing row values when only adding a new value to the list.
ALTER TABLE customers
  MODIFY COLUMN environment_stage ENUM('production','uat','development','on_hold') NULL;

INSERT INTO schema_migrations(version) VALUES ('044_customer_environment_stage_on_hold')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
