-- Persist user activation state so deactivated accounts cannot authenticate.
SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'is_active'
);
SET @column_sql = IF(
  @column_exists = 0,
  'ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER role',
  'SELECT 1'
);
PREPARE user_activation_stmt FROM @column_sql;
EXECUTE user_activation_stmt;
DEALLOCATE PREPARE user_activation_stmt;

INSERT INTO schema_migrations(version)
VALUES ('011_user_activation')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
