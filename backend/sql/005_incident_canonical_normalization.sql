-- Additive incident normalization: canonical UTC timestamps/durations and legacy archive.
-- No existing column is removed or renamed. Deploy before enabling canonical application writes.

USE incident_management_db;
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(100) NOT NULL PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = p_table AND column_name = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
CREATE PROCEDURE add_index_if_missing(IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = p_table AND index_name = p_index
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD ', p_definition);
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
CREATE PROCEDURE add_check_if_missing(IN p_table VARCHAR(64), IN p_check VARCHAR(64), IN p_expression TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = DATABASE() AND table_name = p_table
      AND constraint_name = p_check AND constraint_type = 'CHECK'
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD CONSTRAINT `', p_check, '` CHECK (', p_expression, ')');
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('incidents', 'opened_at_utc', 'DATETIME(6) NULL AFTER date_time_opened');
CALL add_column_if_missing('incidents', 'closed_at_utc', 'DATETIME(6) NULL AFTER date_time_closed');
CALL add_column_if_missing('incidents', 'source_timezone', 'VARCHAR(64) NULL AFTER timezone');
CALL add_column_if_missing('incidents', 'sla_minutes', 'SMALLINT UNSIGNED NULL AFTER sla_hours');
CALL add_column_if_missing('incidents', 'mttr_minutes', 'INT UNSIGNED NULL AFTER mttr_str');

CREATE TABLE IF NOT EXISTS incident_legacy_metadata (
  incident_id INT NOT NULL,
  legacy_month VARCHAR(20) NULL,
  legacy_source VARCHAR(100) NULL,
  legacy_raw JSON NULL,
  internal_status VARCHAR(100) NULL,
  project_area VARCHAR(255) NULL,
  archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  refreshed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (incident_id),
  KEY idx_incident_legacy_source (legacy_source),
  CONSTRAINT fk_incident_legacy_metadata_incident
    FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO incident_legacy_metadata
  (incident_id, legacy_month, legacy_source, legacy_raw, internal_status, project_area)
SELECT id, legacy_month, legacy_source, legacy_raw, internal_status, project_area
FROM incidents
WHERE legacy_month IS NOT NULL OR legacy_source IS NOT NULL OR legacy_raw IS NOT NULL
   OR internal_status IS NOT NULL OR project_area IS NOT NULL
ON DUPLICATE KEY UPDATE
  legacy_month = VALUES(legacy_month),
  legacy_source = VALUES(legacy_source),
  legacy_raw = VALUES(legacy_raw),
  internal_status = VALUES(internal_status),
  project_area = VALUES(project_area);

-- Canonical total minutes. Existing nonzero totals win; legacy parts fill only missing/zero totals.
UPDATE incidents
SET downtime_mins = GREATEST(
  0,
  CASE
    WHEN downtime_mins IS NULL OR (downtime_mins = 0 AND (COALESCE(downtime_hours, 0) <> 0 OR COALESCE(downtime_minutes, 0) <> 0))
      THEN COALESCE(downtime_hours, 0) * 60 + COALESCE(downtime_minutes, 0)
    ELSE downtime_mins
  END
);

UPDATE incidents
SET source_timezone = CASE UPPER(COALESCE(timezone, 'IST'))
  WHEN 'IST' THEN 'Asia/Kolkata'
  WHEN 'UTC' THEN 'Etc/UTC'
  WHEN 'GMT' THEN 'Etc/UTC'
  WHEN 'EST' THEN 'Etc/GMT+5'
  WHEN 'PST' THEN 'Etc/GMT+8'
  WHEN 'PT' THEN 'Etc/GMT+7'
  WHEN 'MST' THEN 'Etc/GMT+7'
  WHEN 'CST' THEN 'Etc/GMT+6'
  WHEN 'JST' THEN 'Asia/Tokyo'
  WHEN 'CET' THEN 'Etc/GMT-1'
  WHEN 'CEST' THEN 'Etc/GMT-2'
  WHEN 'ISR' THEN 'Etc/GMT-2'
  WHEN 'IDT' THEN 'Etc/GMT-3'
  ELSE timezone
END
WHERE source_timezone IS NULL OR source_timezone = '';

-- Offset conversion is deterministic and does not depend on MySQL timezone tables.
UPDATE incidents
SET opened_at_utc = CASE UPPER(COALESCE(timezone, 'IST'))
      WHEN 'IST' THEN CONVERT_TZ(date_time_opened, '+05:30', '+00:00')
      WHEN 'UTC' THEN date_time_opened WHEN 'GMT' THEN date_time_opened
      WHEN 'EST' THEN CONVERT_TZ(date_time_opened, '-05:00', '+00:00')
      WHEN 'PST' THEN CONVERT_TZ(date_time_opened, '-08:00', '+00:00')
      WHEN 'PT' THEN CONVERT_TZ(date_time_opened, '-07:00', '+00:00')
      WHEN 'MST' THEN CONVERT_TZ(date_time_opened, '-07:00', '+00:00')
      WHEN 'CST' THEN CONVERT_TZ(date_time_opened, '-06:00', '+00:00')
      WHEN 'JST' THEN CONVERT_TZ(date_time_opened, '+09:00', '+00:00')
      WHEN 'CET' THEN CONVERT_TZ(date_time_opened, '+01:00', '+00:00')
      WHEN 'CEST' THEN CONVERT_TZ(date_time_opened, '+02:00', '+00:00')
      WHEN 'ISR' THEN CONVERT_TZ(date_time_opened, '+02:00', '+00:00')
      WHEN 'IDT' THEN CONVERT_TZ(date_time_opened, '+03:00', '+00:00')
      ELSE NULL
    END,
    closed_at_utc = CASE UPPER(COALESCE(timezone, 'IST'))
      WHEN 'IST' THEN CONVERT_TZ(date_time_closed, '+05:30', '+00:00')
      WHEN 'UTC' THEN date_time_closed WHEN 'GMT' THEN date_time_closed
      WHEN 'EST' THEN CONVERT_TZ(date_time_closed, '-05:00', '+00:00')
      WHEN 'PST' THEN CONVERT_TZ(date_time_closed, '-08:00', '+00:00')
      WHEN 'PT' THEN CONVERT_TZ(date_time_closed, '-07:00', '+00:00')
      WHEN 'MST' THEN CONVERT_TZ(date_time_closed, '-07:00', '+00:00')
      WHEN 'CST' THEN CONVERT_TZ(date_time_closed, '-06:00', '+00:00')
      WHEN 'JST' THEN CONVERT_TZ(date_time_closed, '+09:00', '+00:00')
      WHEN 'CET' THEN CONVERT_TZ(date_time_closed, '+01:00', '+00:00')
      WHEN 'CEST' THEN CONVERT_TZ(date_time_closed, '+02:00', '+00:00')
      WHEN 'ISR' THEN CONVERT_TZ(date_time_closed, '+02:00', '+00:00')
      WHEN 'IDT' THEN CONVERT_TZ(date_time_closed, '+03:00', '+00:00')
      ELSE NULL
    END
WHERE opened_at_utc IS NULL OR (date_time_closed IS NOT NULL AND closed_at_utc IS NULL);

UPDATE incidents
SET sla_minutes = ROUND(sla_hours * 60)
WHERE sla_minutes IS NULL AND sla_hours IS NOT NULL;

CALL add_index_if_missing('incidents', 'idx_incidents_sf_case_no', 'INDEX idx_incidents_sf_case_no (sf_case_no)');
CALL add_index_if_missing('incidents', 'idx_incidents_customer_opened_utc', 'INDEX idx_incidents_customer_opened_utc (customer_id, opened_at_utc)');
CALL add_index_if_missing('incidents', 'idx_incidents_status_opened_utc', 'INDEX idx_incidents_status_opened_utc (status, opened_at_utc)');
CALL add_index_if_missing('incidents', 'idx_incidents_closed_at_utc', 'INDEX idx_incidents_closed_at_utc (closed_at_utc)');
CALL add_index_if_missing('incidents', 'idx_incidents_project_opened_utc', 'INDEX idx_incidents_project_opened_utc (project, opened_at_utc)');

CALL add_check_if_missing('incidents', 'chk_incidents_downtime_nonnegative', 'downtime_mins >= 0');
CALL add_check_if_missing('incidents', 'chk_incidents_mttd_nonnegative', 'mttd_minutes IS NULL OR mttd_minutes >= 0');
CALL add_check_if_missing('incidents', 'chk_incidents_mttr_nonnegative', 'mttr_minutes IS NULL OR mttr_minutes >= 0');
CALL add_check_if_missing('incidents', 'chk_incidents_utc_order', 'closed_at_utc IS NULL OR opened_at_utc IS NULL OR closed_at_utc >= opened_at_utc');

DROP PROCEDURE add_column_if_missing;
DROP PROCEDURE add_index_if_missing;
DROP PROCEDURE add_check_if_missing;

INSERT INTO schema_migrations(version)
VALUES ('005_incident_canonical_normalization')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

-- Validation gates. Every mismatch/unresolved count must be zero before deprecation.
SELECT 'archive mismatch' AS check_name, COUNT(*) AS mismatch_count
FROM incidents i
LEFT JOIN incident_legacy_metadata l ON l.incident_id = i.id
WHERE (i.legacy_month IS NOT NULL OR i.legacy_source IS NOT NULL OR i.legacy_raw IS NOT NULL
    OR i.internal_status IS NOT NULL OR i.project_area IS NOT NULL)
  AND l.incident_id IS NULL
UNION ALL
SELECT 'downtime mismatch', COUNT(*) FROM incidents
WHERE downtime_mins <> COALESCE(downtime_hours, 0) * 60 + COALESCE(downtime_minutes, 0)
UNION ALL
SELECT 'unresolved opened UTC', COUNT(*) FROM incidents
WHERE date_time_opened IS NOT NULL AND opened_at_utc IS NULL
UNION ALL
SELECT 'unresolved closed UTC', COUNT(*) FROM incidents
WHERE date_time_closed IS NOT NULL AND closed_at_utc IS NULL
UNION ALL
SELECT 'orphan customer', COUNT(*) FROM incidents i LEFT JOIN customers c ON c.id = i.customer_id
WHERE i.customer_id IS NOT NULL AND c.id IS NULL
UNION ALL
SELECT 'orphan area', COUNT(*) FROM incidents i LEFT JOIN area a ON a.id = i.area_id
WHERE i.area_id IS NOT NULL AND a.id IS NULL;
