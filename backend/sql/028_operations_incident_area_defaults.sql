-- Adds only missing master areas needed by Operations email incident defaults.
-- INSERT IGNORE preserves existing records, including their active status and metadata.
START TRANSACTION;

INSERT IGNORE INTO area (area_name, area_code) VALUES
  ('Infrastructure', 'infrastructure'),
  ('Integration', 'integration'),
  ('License', 'license'),
  ('InMemoryMiddleware', 'inmemorymiddleware'),
  ('Local Agent', 'local_agent'),
  ('Workspace', 'workspace'),
  ('Magic Cloud Manager', 'magic_cloud_manager'),
  ('NGC - MES', 'ngc_mes'),
  ('NGC - MDE', 'ngc_mde'),
  ('Historian', 'historian'),
  ('Redis', 'redis'),
  ('NGC - AIML', 'ngc_aiml');

INSERT INTO schema_migrations(version) VALUES ('028_operations_incident_area_defaults')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

COMMIT;
