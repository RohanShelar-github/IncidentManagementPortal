-- Tie portal mailbox notifications to the Graph message they represent.
-- The email is shared, so a read action clears the corresponding popup for
-- every portal user with Operations access.
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'notifications'
    AND column_name = 'mailbox_message_id'
);
SET @column_sql = IF(
  @column_exists = 0,
  'ALTER TABLE notifications ADD COLUMN mailbox_message_id VARCHAR(255) NULL AFTER actor_id',
  'SELECT 1'
);
PREPARE mailbox_notification_column_stmt FROM @column_sql;
EXECUTE mailbox_notification_column_stmt;
DEALLOCATE PREPARE mailbox_notification_column_stmt;

SET @index_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'notifications'
    AND index_name = 'idx_notif_mailbox_message'
);
SET @index_sql = IF(
  @index_exists = 0,
  'ALTER TABLE notifications ADD INDEX idx_notif_mailbox_message (mailbox_message_id, is_read)',
  'SELECT 1'
);
PREPARE mailbox_notification_index_stmt FROM @index_sql;
EXECUTE mailbox_notification_index_stmt;
DEALLOCATE PREPARE mailbox_notification_index_stmt;

-- Earlier notifications did not have a Graph message id, so their live
-- unread state cannot be verified. Retire those stale popup records.
UPDATE notifications
SET is_read = 1
WHERE type = 'mailbox' AND mailbox_message_id IS NULL AND is_read = 0;

INSERT INTO schema_migrations(version) VALUES ('021_mailbox_notifications_follow_read_status')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
