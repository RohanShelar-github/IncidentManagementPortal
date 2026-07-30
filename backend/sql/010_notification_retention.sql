-- Support efficient deletion of notifications after the 24-hour retention period.
SET @index_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'notifications'
    AND index_name = 'idx_notif_retention'
);
SET @index_sql = IF(
  @index_exists = 0,
  'ALTER TABLE notifications ADD INDEX idx_notif_retention (created_at)',
  'SELECT 1'
);
PREPARE notification_retention_stmt FROM @index_sql;
EXECUTE notification_retention_stmt;
DEALLOCATE PREPARE notification_retention_stmt;

INSERT INTO schema_migrations(version)
VALUES ('010_notification_retention')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
