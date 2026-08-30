-- Allows compressed, sanitized inline incident screenshots while preserving existing records.
ALTER TABLE incidents MODIFY COLUMN description MEDIUMTEXT NULL;

INSERT INTO schema_migrations(version) VALUES ('025_incident_description_images')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
