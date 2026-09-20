-- Dedicated permission for editing a customer's Inbound CSM name from
-- Customer 360. Only the Admin role receives it by default; other roles
-- can be granted it later via Role Management.
START TRANSACTION;

INSERT INTO permissions(permission_key, permission_name) VALUES
('manage_customer_csm', 'Manage Customer CSM')
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, 'manage_customer_csm' FROM roles r WHERE r.role_key = 'admin';

INSERT INTO schema_migrations(version) VALUES ('036_customer_csm_permission')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

COMMIT;
