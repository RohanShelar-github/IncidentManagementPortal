USE incident_management_db;

DROP PROCEDURE IF EXISTS add_incident_comments_column;
DELIMITER $$
CREATE PROCEDURE add_incident_comments_column()
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'incidents'
       AND column_name = 'comments'
  ) THEN
    ALTER TABLE incidents ADD COLUMN comments JSON NULL AFTER tags;
  END IF;
END$$
DELIMITER ;
CALL add_incident_comments_column();
DROP PROCEDURE IF EXISTS add_incident_comments_column;

UPDATE incidents i
JOIN (
  SELECT l.incident_id,
         JSON_ARRAYAGG(JSON_OBJECT(
           'author', COALESCE(u.full_name, 'User'),
           'author_id', l.action_by,
           'action', 'commented',
           'type', 'comment',
           'detail', l.detail,
           'created_at', l.created_at
         )) AS stored_comments
    FROM activity_logs l
    LEFT JOIN users u ON u.id = l.action_by
   WHERE l.action_type = 'comment'
   GROUP BY l.incident_id
) existing_comments ON existing_comments.incident_id = i.id
SET i.comments = existing_comments.stored_comments
WHERE i.comments IS NULL OR JSON_LENGTH(i.comments) = 0;

INSERT INTO schema_migrations(version)
VALUES ('006_store_incident_comments')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
