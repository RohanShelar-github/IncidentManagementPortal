-- Align database roles with the six roles defined in the portal.
-- Viewer was a legacy duplicate of the read-only Stakeholder role.
UPDATE users SET role = 'stakeholder' WHERE role = 'viewer';

ALTER TABLE users
  MODIFY COLUMN role ENUM('admin','cso','pmo','aoc','engineer','stakeholder')
  NOT NULL DEFAULT 'stakeholder';

INSERT INTO schema_migrations(version)
VALUES ('012_align_user_roles')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
