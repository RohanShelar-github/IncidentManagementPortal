ALTER TABLE notifications
  ADD COLUMN type VARCHAR(30) NOT NULL DEFAULT 'info' AFTER user_id,
  ADD COLUMN incident_ref VARCHAR(20) NULL AFTER type,
  ADD COLUMN is_mention TINYINT(1) NOT NULL DEFAULT 0 AFTER incident_ref,
  ADD COLUMN actor_id INT NULL AFTER is_mention,
  ADD INDEX idx_notif_incident (incident_ref),
  ADD INDEX idx_notif_created (user_id, id);
