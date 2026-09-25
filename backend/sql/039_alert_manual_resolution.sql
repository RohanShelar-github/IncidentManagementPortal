-- Adds the ability to mark an Alert Compliance "Went Quiet" alert as
-- manually resolved. Reuses the existing operations_alert_comments table
-- instead of a new one: a resolution is just a comment with a flag set, so
-- the mandatory root-cause note is automatically part of the same audit
-- trail already shown in the alert's comment history. Purely additive.
START TRANSACTION;

ALTER TABLE operations_alert_comments
  ADD COLUMN is_resolution TINYINT(1) NOT NULL DEFAULT 0 AFTER comment_text;

INSERT INTO schema_migrations(version) VALUES ('039_alert_manual_resolution')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

COMMIT;
