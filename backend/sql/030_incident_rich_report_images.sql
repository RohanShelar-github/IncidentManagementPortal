-- Rich-text report fields may contain sanitized inline screenshots. TEXT is
-- limited to 64 KiB and caused incident updates with an image in RCA or
-- Resolution Steps to fail with a database "data too long" error.
ALTER TABLE incidents
  MODIFY COLUMN rca MEDIUMTEXT NULL,
  MODIFY COLUMN resolution MEDIUMTEXT NULL;

INSERT INTO schema_migrations(version) VALUES ('030_incident_rich_report_images')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
