-- Database: incident_management_db

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role ENUM('admin', 'engineer', 'pmo', 'cso', 'aoc', 'stakeholder') DEFAULT 'engineer',
  initials VARCHAR(3),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Incidents Table
CREATE TABLE IF NOT EXISTS incidents (
  id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  customer VARCHAR(255),
  project VARCHAR(255),
  severity ENUM('Critical', 'High', 'Medium', 'Low') NOT NULL,
  status VARCHAR(100) NOT NULL,
  engineer VARCHAR(255),
  date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
  description TEXT,
  components VARCHAR(500),
  applications VARCHAR(500),
  sla_hours INT,
  area ENUM('Infra', 'Application', 'Historian'),
  
  -- For closed incidents
  rca TEXT,
  resolution TEXT,
  resolved_by VARCHAR(255),
  sf_case VARCHAR(100),
  downtime_h INT DEFAULT 0,
  downtime_m INT DEFAULT 0,
  mttr_h INT DEFAULT 0,
  mttr_m INT DEFAULT 0,
  
  created_by INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_customer (customer),
  INDEX idx_status (status),
  INDEX idx_severity (severity),
  INDEX idx_area (area),
  INDEX idx_date (date_created)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Incident Comments/Activity Table
CREATE TABLE IF NOT EXISTS incident_comments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  incident_id VARCHAR(50) NOT NULL,
  author VARCHAR(255),
  action VARCHAR(100),
  detail TEXT,
  comment_text TEXT,
  type ENUM('create', 'status', 'comment', 'escalate', 'close', 'tag', 'edit', 'system'),
  user_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_incident (incident_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Incident Tags Table
CREATE TABLE IF NOT EXISTS incident_tags (
  id INT PRIMARY KEY AUTO_INCREMENT,
  incident_id VARCHAR(50) NOT NULL,
  tag_name VARCHAR(100) NOT NULL,
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  UNIQUE KEY unique_incident_tag (incident_id, tag_name),
  INDEX idx_incident (incident_id),
  INDEX idx_tag (tag_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert default users
INSERT INTO users (email, password, name, role, initials) VALUES
('admin@magiccloud.io', 'admin123', 'Admin User', 'admin', 'A'),
('babai_chatterjee@magicsoftware.com', 'babai123', 'Babai Chatterjee', 'admin', 'BC'),
('rohan_shelar@magicsoftware.com', 'rohan123', 'Rohan Shelar', 'admin', 'RS'),
('neeshu_malik@magicsoftware.com', 'neeshu123', 'Neeshu Malik', 'pmo', 'NM'),
('cso@magiccloud.io', 'cso123', 'CSO User', 'cso', 'CS'),
('aoc@magiccloud.io', 'aoc123', 'AOC User', 'aoc', 'AO')
ON DUPLICATE KEY UPDATE name=VALUES(name);
