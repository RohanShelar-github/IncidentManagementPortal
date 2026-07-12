-- Migration: ensure incident create persists timezone and MTTD values
-- Target DB: incident_management_db
-- Safe to run after 001/002; preserves existing data.

USE incident_management_db;
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- PRE-MIGRATION VALIDATION
SELECT 'timezone column exists' AS check_name, COUNT(*) AS count
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'incidents' AND column_name = 'timezone';

SELECT 'mttd columns exist' AS check_name, COUNT(*) AS count
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'incidents' AND column_name IN ('mttd_str', 'mttd_minutes');

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
DELIMITER ;

CALL add_column_if_missing('incidents', 'timezone', 'VARCHAR(10) NOT NULL DEFAULT ''IST'' AFTER closed_date');
CALL add_column_if_missing('incidents', 'mttd_str', 'VARCHAR(20) NULL AFTER downtime_mins');
CALL add_column_if_missing('incidents', 'mttd_minutes', 'INT NULL AFTER mttd_str');
CALL add_index_if_missing('incidents', 'idx_incidents_timezone', 'INDEX idx_incidents_timezone (timezone)');

DROP PROCEDURE add_column_if_missing;
DROP PROCEDURE add_index_if_missing;

-- POST-MIGRATION VERIFICATION
SELECT column_name, column_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'incidents'
  AND column_name IN ('timezone', 'mttd_str', 'mttd_minutes')
ORDER BY column_name;

-- ROLLBACK STRATEGY
-- Preferred rollback: restore the pre-migration backup.
-- Logical rollback, only if application code has also been reverted and values are no longer needed:
--   ALTER TABLE incidents DROP INDEX idx_incidents_timezone;
--   ALTER TABLE incidents DROP COLUMN mttd_minutes;
--   ALTER TABLE incidents DROP COLUMN mttd_str;
--   ALTER TABLE incidents DROP COLUMN timezone;
