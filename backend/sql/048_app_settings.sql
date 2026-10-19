-- Generic singleton-style settings store (one row per setting_key, a JSON
-- blob per row) — reusable for future app-wide settings, not specific to any
-- one feature. First consumer: the admin-customizable Dashboard card order
-- (setting_key = 'dashboard_layout'). Purely additive — a brand new table,
-- nothing existing is altered. Dropping this table fully reverts every
-- feature built on it.
START TRANSACTION;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
  setting_value JSON NOT NULL,
  updated_by INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_app_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('048_app_settings')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

COMMIT;
