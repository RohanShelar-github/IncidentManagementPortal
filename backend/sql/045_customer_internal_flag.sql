-- Marks a customer as internal (e.g. "Demo", "Matrix" — test/internal
-- accounts rather than real external customers), so the Customer 360
-- picker can show an "INTERNAL" tag on its card. A simple boolean, defaulting
-- to 0 (not internal) for every existing customer, admin-editable from Data
-- Management — same pattern as environment_stage (migration 043).
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers'
    AND column_name = 'is_internal'
);
SET @column_sql = IF(
  @column_exists = 0,
  "ALTER TABLE customers ADD COLUMN is_internal TINYINT(1) NOT NULL DEFAULT 0 AFTER environment_stage",
  'SELECT 1'
);
PREPARE customer_internal_flag_stmt FROM @column_sql;
EXECUTE customer_internal_flag_stmt;
DEALLOCATE PREPARE customer_internal_flag_stmt;

INSERT INTO schema_migrations(version) VALUES ('045_customer_internal_flag')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
