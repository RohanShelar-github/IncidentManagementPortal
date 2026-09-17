-- Store the time of the user's most recent authenticated portal activity.
SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'last_active_at'
);
SET @column_sql = IF(
  @column_exists = 0,
  'ALTER TABLE users ADD COLUMN last_active_at DATETIME NULL AFTER is_active',
  'SELECT 1'
);
PREPARE user_last_active_stmt FROM @column_sql;
EXECUTE user_last_active_stmt;
DEALLOCATE PREPARE user_last_active_stmt;

INSERT INTO schema_migrations(version) VALUES ('035_user_last_active')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
