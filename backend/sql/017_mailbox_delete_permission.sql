-- Allow deletion from the shared mailbox to be assigned separately by role.
INSERT INTO permissions(permission_key, permission_name) VALUES
('delete_mailbox','Delete Mailbox Emails')
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, p.permission_key FROM roles r JOIN permissions p ON p.permission_key = 'delete_mailbox'
WHERE r.role_key = 'admin';

INSERT INTO schema_migrations(version) VALUES ('017_mailbox_delete_permission')
ON DUPLICATE KEY UPDATE applied_at=applied_at;
