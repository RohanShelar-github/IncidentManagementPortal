-- Tracks which deployment stage a customer is currently in: Production
-- (a.k.a. "Live"), UAT, or Development. A simple fixed 3-value field
-- (not an admin-extensible lookup table like incident_tags) since these
-- three stages are fixed business categories. NULL for every existing
-- customer until an admin sets it — there's no reliable way to infer a
-- customer's deployment stage from existing data, so this is intentionally
-- not backfilled.
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers'
    AND column_name = 'environment_stage'
);
SET @column_sql = IF(
  @column_exists = 0,
  "ALTER TABLE customers ADD COLUMN environment_stage ENUM('production','uat','development') NULL AFTER timezone",
  'SELECT 1'
);
PREPARE customer_env_stage_stmt FROM @column_sql;
EXECUTE customer_env_stage_stmt;
DEALLOCATE PREPARE customer_env_stage_stmt;

INSERT INTO schema_migrations(version) VALUES ('043_customer_environment_stage')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
