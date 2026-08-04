-- Persist editable user profile information.
SET @column_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'phone') = 0,
  'ALTER TABLE users ADD COLUMN phone VARCHAR(50) NULL AFTER full_name',
  'SELECT 1'
);
PREPARE user_profile_stmt FROM @column_sql;
EXECUTE user_profile_stmt;
DEALLOCATE PREPARE user_profile_stmt;

SET @column_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'department') = 0,
  'ALTER TABLE users ADD COLUMN department VARCHAR(100) NULL AFTER phone',
  'SELECT 1'
);
PREPARE user_profile_stmt FROM @column_sql;
EXECUTE user_profile_stmt;
DEALLOCATE PREPARE user_profile_stmt;

SET @column_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'location') = 0,
  'ALTER TABLE users ADD COLUMN location VARCHAR(100) NULL AFTER department',
  'SELECT 1'
);
PREPARE user_profile_stmt FROM @column_sql;
EXECUTE user_profile_stmt;
DEALLOCATE PREPARE user_profile_stmt;

SET @column_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'bio') = 0,
  'ALTER TABLE users ADD COLUMN bio VARCHAR(1000) NULL AFTER location',
  'SELECT 1'
);
PREPARE user_profile_stmt FROM @column_sql;
EXECUTE user_profile_stmt;
DEALLOCATE PREPARE user_profile_stmt;

INSERT INTO schema_migrations(version)
VALUES ('013_user_profile_fields')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
