-- Rebuild canonical UTC timestamps from the stored wall-clock values and the
-- incident timezone. This repairs records previously normalized as IST after
-- their timezone was changed (for example EST incidents).
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
      ELSE opened_at_utc
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
      ELSE closed_at_utc
    END
WHERE date_time_opened IS NOT NULL OR date_time_closed IS NOT NULL;

INSERT INTO schema_migrations(version) VALUES ('015_repair_incident_timezone_values')
ON DUPLICATE KEY UPDATE applied_at=applied_at;
