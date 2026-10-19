-- Dedicated permission letting an admin drag-and-drop reorder every card on
-- the Dashboard page and save that arrangement globally for all users.
-- Admin-only by default; other roles can be granted it later via Role
-- Management. Purely additive — no existing table altered.
START TRANSACTION;

INSERT INTO permissions(permission_key, permission_name) VALUES
('customize_dashboard_layout', 'Customize Dashboard Layout')
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, 'customize_dashboard_layout' FROM roles r WHERE r.role_key IN ('admin');

INSERT INTO schema_migrations(version) VALUES ('047_customize_dashboard_layout_permission')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

COMMIT;
