# Incident Management Portal - Backend Setup Guide

## Overview
This is a complete Node.js/Express backend for the Incident Management Portal with MySQL database integration.

### Features
- ✅ User authentication with JWT tokens
- ✅ MySQL database for persistent storage
- ✅ Incident CRUD operations
- ✅ Dashboard statistics and filtering
- ✅ Activity logging and comments
- ✅ Tag management
- ✅ Role-based access control

---

## Prerequisites

### Required Software
- **Node.js** v14+ (Download from https://nodejs.org/)
- **MySQL** v5.7+ (Download from https://www.mysql.com/downloads/)
- **npm** (comes with Node.js)

### Verify Installation
```bash
node --version
npm --version
mysql --version
```

---

## Installation Steps

### 1. Create MySQL Database

Open MySQL command line or MySQL Workbench and run:

```bash
mysql -u root -p < backend/sql/schema.sql
```

Or manually:
```sql
CREATE DATABASE IF NOT EXISTS incident_management_db;
USE incident_management_db;
-- Then execute all queries from backend/sql/schema.sql
```

**Default Users Created:**
| Email | Password | Role |
|-------|----------|------|
| admin@magiccloud.io | admin123 | admin |
| babai_chatterjee@magicsoftware.com | babai123 | admin |
| rohan_shelar@magicsoftware.com | rohan123 | admin |
| neeshu_malik@magicsoftware.com | neeshu123 | pmo |
| cso@magiccloud.io | cso123 | cso |
| aoc@magiccloud.io | aoc123 | aoc |

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your MySQL credentials:

```env
# MySQL Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=incident_management_db

# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-secret-key-change-this-in-production-2024
JWT_EXPIRY=7d

# CORS Configuration
CORS_ORIGIN=http://localhost:8000
```

### 4. Start the Backend Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

You should see:
```
╔═══════════════════════════════════════════════════════════╗
║   Incident Management Portal - Backend Server Started     ║
╠═══════════════════════════════════════════════════════════╣
║   🚀 Server running at: http://localhost:3000             ║
║   📝 API Base URL: http://localhost:3000/api              ║
║   🔐 Environment: development                             ║
╚═══════════════════════════════════════════════════════════╝
```

### 5. Access the Frontend

Open your browser and navigate to:
```
file:///d:/CSO/IncidentManagementPortal/index.html
```

Or if you have a local server running for static files:
```
http://localhost:8000/
```

---

## API Documentation

### Base URL
```
http://localhost:3000/api
```

### Authentication Endpoints

#### 1. Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@magiccloud.io",
  "password": "admin123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "admin@magiccloud.io",
    "name": "Admin User",
    "role": "admin",
    "initials": "A"
  }
}
```

#### 2. Get All Users
```http
GET /api/auth/users
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "email": "admin@magiccloud.io",
      "name": "Admin User",
      "role": "admin",
      "initials": "A"
    }
  ]
}
```

#### 3. Get Current User
```http
GET /api/auth/me
Authorization: Bearer {token}
```

---

### Incident Endpoints

#### 1. Create Incident
```http
POST /api/incidents
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Database connection timeout",
  "customer": "demo",
  "project": "Cloud Infrastructure",
  "severity": "Critical",
  "status": "New",
  "engineer": "Babai Chatterjee",
  "description": "Production DB connections spiking",
  "components": "Database Cluster",
  "applications": "Customer Portal",
  "sla_hours": 1,
  "area": "Infra",
  "tags": ["database", "timeout"]
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Incident created successfully",
  "data": {
    "id": "INC-001"
  }
}
```

#### 2. Get All Incidents (with Filters)
```http
GET /api/incidents?customer=demo&severity=Critical&status=New&area=Infra&limit=10&offset=0
Authorization: Bearer {token}
```

**Query Parameters:**
- `customer` - Filter by customer name
- `area` - Filter by area (Infra, Application, Historian)
- `severity` - Filter by severity (Critical, High, Medium, Normal)
- `status` - Filter by status
- `tags` - Filter by tags
- `search` - Search in title and description
- `limit` - Number of results (default: 50)
- `offset` - Pagination offset (default: 0)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "INC-001",
      "title": "Database connection timeout",
      "customer": "demo",
      "severity": "Critical",
      "status": "New",
      "engineer": "Babai Chatterjee",
      "date_created": "2026-03-01T10:30:00Z",
      "tags": ["database", "timeout"]
    }
  ]
}
```

#### 3. Get Single Incident
```http
GET /api/incidents/INC-001
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "INC-001",
    "title": "Database connection timeout",
    "customer": "demo",
    "severity": "Critical",
    "status": "New",
    "engineer": "Babai Chatterjee",
    "description": "Production DB connections spiking",
    "date_created": "2026-03-01T10:30:00Z",
    "tags": ["database", "timeout"],
    "comments": [
      {
        "id": 1,
        "author": "Babai Chatterjee",
        "action": "created incident",
        "detail": "Severity: Critical · Customer: demo",
        "created_at": "2026-03-01T10:30:00Z"
      }
    ]
  }
}
```

#### 4. Update Incident
```http
PUT /api/incidents/INC-001
Authorization: Bearer {token}
Content-Type: application/json

{
  "status": "In Progress",
  "engineer": "Rohan Shelar",
  "severity": "High"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Incident updated successfully"
}
```

#### 5. Delete Incident
```http
DELETE /api/incidents/INC-001
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Incident deleted successfully"
}
```

#### 6. Get Dashboard Statistics
```http
GET /api/incidents/stats/dashboard
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total": 20,
    "open": 15,
    "critical": 3,
    "statusBreakdown": [
      { "status": "New", "count": 5 },
      { "status": "In Progress", "count": 8 },
      { "status": "Closed", "count": 7 }
    ],
    "severityBreakdown": [
      { "severity": "Critical", "count": 3 },
      { "severity": "High", "count": 8 }
    ],
    "areaBreakdown": [
      { "area": "Infra", "count": 12 },
      { "area": "Application", "count": 5 }
    ]
  }
}
```

#### 7. Add Comment to Incident
```http
POST /api/incidents/INC-001/comments
Authorization: Bearer {token}
Content-Type: application/json

{
  "comment_text": "Investigating the root cause",
  "action": "commented",
  "detail": "Found connection pool issue"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Comment added successfully"
}
```

---

## Database Schema

### Tables

#### Users Table
```sql
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role ENUM('admin', 'engineer', 'pmo', 'cso', 'aoc', 'stakeholder'),
  initials VARCHAR(3),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Incidents Table
```sql
CREATE TABLE incidents (
  id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  customer VARCHAR(255),
  project VARCHAR(255),
  severity ENUM('Critical', 'High', 'Medium', 'Normal'),
  status VARCHAR(100) NOT NULL,
  engineer VARCHAR(255),
  date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
  description TEXT,
  components VARCHAR(500),
  applications VARCHAR(500),
  sla_hours INT,
  area ENUM('Infra', 'Application', 'Historian'),
  rca TEXT,
  resolution TEXT,
  resolved_by VARCHAR(255),
  sf_case VARCHAR(100),
  downtime_h INT,
  downtime_m INT,
  mttr_h INT,
  mttr_m INT,
  created_by INT FOREIGN KEY
);
```

#### Incident Comments Table
```sql
CREATE TABLE incident_comments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  incident_id VARCHAR(50) FOREIGN KEY,
  author VARCHAR(255),
  action VARCHAR(100),
  detail TEXT,
  comment_text TEXT,
  type ENUM('create', 'status', 'comment', 'escalate', 'close', 'tag', 'edit', 'system'),
  user_id INT FOREIGN KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Incident Tags Table
```sql
CREATE TABLE incident_tags (
  id INT PRIMARY KEY AUTO_INCREMENT,
  incident_id VARCHAR(50) FOREIGN KEY,
  tag_name VARCHAR(100) NOT NULL,
  UNIQUE KEY (incident_id, tag_name)
);
```

---

## Troubleshooting

### MySQL Connection Error
**Error:** `Error: connect ECONNREFUSED 127.0.0.1:3306`

**Solution:**
1. Ensure MySQL server is running
2. Check DB_HOST, DB_PORT, DB_USER, DB_PASSWORD in `.env`
3. Verify database `incident_management_db` exists

### JWT Token Issues
**Error:** `401 - Invalid or expired token`

**Solution:**
1. Ensure token is passed in Authorization header: `Bearer {token}`
2. Token may have expired - login again to get a new token
3. Check JWT_SECRET in `.env` matches across requests

### CORS Error
**Error:** `Access to XMLHttpRequest blocked by CORS policy`

**Solution:**
1. Ensure CORS_ORIGIN in `.env` matches your frontend URL
2. For local file access, the frontend may need to be served from a web server
3. Add the correct origin to CORS_ORIGIN

---

## Frontend Integration

The frontend (`index.html` and `js/app.js`) is already configured to:
1. Use the backend API for authentication
2. Fetch incidents from the backend
3. Create, update, and delete incidents via API
4. Apply filters and search using backend queries

**Key Configuration:** `config/config.js`
```javascript
window.APP_CONFIG = {
  API_BASE_URL: "http://localhost:3000/api",
  APP_NAME: "Incident Management Portal",
  VERSION: "1.0.0",
  ENABLE_BACKEND: true,
  JWT_TOKEN_KEY: "incident_portal_token"
};
```

---

## Development

### Project Structure
```
backend/
├── server.js              # Main Express server
├── package.json           # Dependencies
├── .env                   # Environment variables
├── config/
│   └── database.js        # MySQL connection pool
├── middleware/
│   └── auth.js            # JWT authentication
├── controllers/
│   ├── authController.js  # Auth endpoints
│   └── incidentController.js  # Incident endpoints
├── routes/
│   ├── authRoutes.js      # Auth routes
│   └── incidentRoutes.js  # Incident routes
└── sql/
    └── schema.sql         # Database schema
```

### Adding a New Endpoint

1. **Create controller function** in `controllers/`
2. **Add route** in `routes/`
3. **Export route** in `server.js`
4. **Add middleware** in `middleware/` if needed

### Running Tests
```bash
# Manual API testing with curl
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@magiccloud.io","password":"admin123"}'
```

---

## Production Deployment

### Before Deploying

1. **Change JWT Secret:**
   ```
   JWT_SECRET=your-very-secure-random-key-12345
   ```

2. **Change Database Password:**
   ```sql
   ALTER USER 'root'@'localhost' IDENTIFIED BY 'strong-password';
   FLUSH PRIVILEGES;
   ```

3. **Update CORS Origin:**
   ```
   CORS_ORIGIN=https://yourdomain.com
   ```

4. **Set Node Environment:**
   ```
   NODE_ENV=production
   ```

5. **Use Process Manager (PM2):**
   ```bash
   npm install -g pm2
   pm2 start server.js --name "incident-portal"
   pm2 save
   pm2 startup
   ```

---

## Support & Documentation

For more information:
- Express.js: https://expressjs.com/
- MySQL: https://dev.mysql.com/doc/
- JWT: https://jwt.io/
- Node.js: https://nodejs.org/en/docs/

---

**Created:** 2026
**Version:** 1.0.0
