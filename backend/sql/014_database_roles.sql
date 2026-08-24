-- Centralize role definitions and permissions in MySQL.
CREATE TABLE IF NOT EXISTS roles (
  id INT NOT NULL AUTO_INCREMENT,
  role_key VARCHAR(50) NOT NULL,
  role_name VARCHAR(100) NOT NULL,
  icon VARCHAR(32) NULL,
  color VARCHAR(20) NOT NULL DEFAULT 'blue',
  description VARCHAR(500) NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_key (role_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  permission_key VARCHAR(50) NOT NULL,
  permission_name VARCHAR(100) NOT NULL,
  PRIMARY KEY (permission_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT NOT NULL,
  permission_key VARCHAR(50) NOT NULL,
  PRIMARY KEY (role_id, permission_key),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_key) REFERENCES permissions(permission_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permissions(permission_key, permission_name) VALUES
('view_dashboard','View Dashboard'),('view_incidents','View Incidents'),('create_incidents','Create Incidents'),
('edit_incidents','Edit Incidents'),('close_incidents','Close Incidents'),('view_reports','View Reports'),
('export_reports','Export Reports'),('view_customer360','View Customer 360'),('manage_users','Manage Users'),
('view_mailbox','View Mailbox'),('send_mailbox','Send Mailbox Replies'),('delete_mailbox','Delete Mailbox Emails'),('manage_roles','Manage Roles'),('assign_roles','Assign Roles'),('manage_data','Manage Data')
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

INSERT INTO roles(role_key, role_name, icon, color, description, is_system) VALUES
('admin','Admin','🛡','purple','Full access to all portal features including user and role management.',1),
('cso','CSO','🌐','green','Cloud Service Operations — manages and resolves incidents, generates reports.',0),
('pmo','PMO','📋','yellow','Project Management Office — read-only access to incidents and reports.',0),
('aoc','AOC','🔧','red','Area Operations Center — operational incident handling and reporting.',0),
('engineer','Engineer','🛠','blue','Field engineer — can create and manage assigned incidents.',0),
('stakeholder','Stakeholder','👁','gray','Read-only observer — can view dashboard and incidents only.',0)
ON DUPLICATE KEY UPDATE role_name=VALUES(role_name);

INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, p.permission_key FROM roles r JOIN permissions p
WHERE r.role_key='admin';
INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, p.permission_key FROM roles r JOIN permissions p ON p.permission_key IN
('view_dashboard','view_incidents','edit_incidents','close_incidents','view_reports','export_reports','view_customer360') WHERE r.role_key='cso';
INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, p.permission_key FROM roles r JOIN permissions p ON p.permission_key IN
('view_dashboard','view_incidents','view_reports','export_reports','view_customer360') WHERE r.role_key='pmo';
INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, p.permission_key FROM roles r JOIN permissions p ON p.permission_key IN
('view_dashboard','view_incidents','create_incidents','edit_incidents','close_incidents','view_reports','export_reports','view_customer360') WHERE r.role_key='aoc';
INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, p.permission_key FROM roles r JOIN permissions p ON p.permission_key IN
('view_dashboard','view_incidents','create_incidents','edit_incidents','close_incidents','view_reports','view_customer360') WHERE r.role_key='engineer';
INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, p.permission_key FROM roles r JOIN permissions p ON p.permission_key IN
('view_dashboard','view_incidents') WHERE r.role_key='stakeholder';

ALTER TABLE users MODIFY COLUMN role VARCHAR(50) NOT NULL DEFAULT 'stakeholder';

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints
 WHERE constraint_schema=DATABASE() AND table_name='users' AND constraint_name='fk_users_role');
SET @fk_sql = IF(@fk_exists=0,
 'ALTER TABLE users ADD CONSTRAINT fk_users_role FOREIGN KEY (role) REFERENCES roles(role_key) ON UPDATE CASCADE',
 'SELECT 1');
PREPARE database_roles_stmt FROM @fk_sql;
EXECUTE database_roles_stmt;
DEALLOCATE PREPARE database_roles_stmt;

INSERT INTO schema_migrations(version) VALUES ('014_database_roles')
ON DUPLICATE KEY UPDATE applied_at=applied_at;
