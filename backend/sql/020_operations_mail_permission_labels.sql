-- User-facing terminology only; stable permission keys remain unchanged.
UPDATE permissions SET permission_name = 'View Operations' WHERE permission_key = 'view_mailbox';
UPDATE permissions SET permission_name = 'Send Operations Mail' WHERE permission_key = 'send_mailbox';
UPDATE permissions SET permission_name = 'Delete Operations Emails' WHERE permission_key = 'delete_mailbox';

INSERT INTO schema_migrations(version) VALUES ('020_operations_mail_permission_labels')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
