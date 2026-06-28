# 🎯 Incident Management Portal - Complete Setup Guide

## Overview

The **Incident Management Portal** is a full-stack web application for tracking, managing, and resolving incidents in real-time. This guide covers the complete setup process for both frontend and backend.

### Key Features
- ✅ User Authentication with JWT tokens
- ✅ Create, Read, Update, Delete (CRUD) incidents
- ✅ Dashboard with statistics and filtering
- ✅ Advanced search and filtering capabilities
- ✅ Activity logging and comments
- ✅ Role-based access control (RBAC)
- ✅ Tag management and categorization
- ✅ MySQL database for data persistence

---

## 📋 Prerequisites

### System Requirements
- **Windows 10+** or **Mac/Linux**
- **Node.js v14+** - https://nodejs.org/
- **MySQL Server 5.7+** - https://www.mysql.com/downloads/
- **Modern Web Browser** (Chrome, Firefox, Edge, Safari)
- **Visual Studio Code** (Optional but recommended) - https://code.visualstudio.com/

### Verify Installation

Open Command Prompt or Terminal and run:

```bash
node --version      # Should show v14.0.0 or higher
npm --version       # Should show v6.0.0 or higher
mysql --version     # Should show mysql version
```

---

## 🗄️ Step 1: Setup MySQL Database

### Option A: Using MySQL Command Line

1. **Open Command Prompt/Terminal**

2. **Connect to MySQL:**
   ```bash
   mysql -u root -p
   ```
   Enter your MySQL root password

3. **Create Database:**
   ```sql
   CREATE DATABASE IF NOT EXISTS incident_management_db;
   ```

4. **Exit MySQL:**
   ```sql
   EXIT;
   ```

5. **Import Schema:**
   Navigate to the project folder and run:
   ```bash
   cd d:\CSO\IncidentManagementPortal\backend
   mysql -u root -p incident_management_db < sql\schema.sql
   ```
   Enter your MySQL root password

### Option B: Using MySQL Workbench

1. Open MySQL Workbench
2. Click "Database" → "Create Schema"
3. Name it `incident_management_db`
4. Right-click the schema → "Execute SQL Script"
5. Select `backend/sql/schema.sql`
6. Click Execute

### Verify Database Creation

```bash
mysql -u root -p -e "USE incident_management_db; SHOW TABLES; SELECT * FROM users;"
```

You should see 4 tables created and 6 default users inserted.

---

## ⚙️ Step 2: Setup Backend Server

### 1. Install Node.js Dependencies

```bash
cd d:\CSO\IncidentManagementPortal\backend
npm install
```

**Expected output:**
```
added 150+ packages in 30s
```

### 2. Configure Environment Variables

**Copy the example file:**
```bash
copy .env.example .env
```

**Edit `.env` file** (open in any text editor):

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

**Important:** Change these values if you have a different MySQL password or port!

### 3. Start the Backend Server

```bash
npm run dev
```

**You should see:**
```
╔═══════════════════════════════════════════════════════════╗
║   Incident Management Portal - Backend Server Started     ║
╠═══════════════════════════════════════════════════════════╣
║   🚀 Server running at: http://localhost:3000             ║
║   📝 API Base URL: http://localhost:3000/api              ║
║   🔐 Environment: development                             ║
╚═══════════════════════════════════════════════════════════╝
```

**Keep this terminal open** - it will continue running the backend server.

---

## 🌐 Step 3: Start the Frontend

### Option A: Using Live Server (Recommended)

1. **Install Live Server Extension** in VS Code
   - Open VS Code
   - Go to Extensions (Ctrl+Shift+X)
   - Search for "Live Server"
   - Click Install

2. **Start Live Server**
   - Open `index.html` in VS Code
   - Right-click on the file
   - Select "Open with Live Server"
   - Browser will open at `http://localhost:5500/`

### Option B: Using Python's HTTP Server

```bash
cd d:\CSO\IncidentManagementPortal
python -m http.server 8000
```

Access at: `http://localhost:8000/`

### Option C: Direct File Access

Simply open the file in your browser:
```
file:///d:/CSO/IncidentManagementPortal/index.html
```

---

## ✅ Step 4: Test Login

1. **Open the Application** in your browser
2. **Login with default credentials:**

   | Email | Password | Role |
   |-------|----------|------|
   | admin@magiccloud.io | admin123 | Admin |
   | babai_chatterjee@magicsoftware.com | babai123 | Admin |
   | rohan_shelar@magicsoftware.com | rohan123 | Admin |
   | neeshu_malik@magicsoftware.com | neeshu123 | PMO |
   | cso@magiccloud.io | cso123 | CSO |
   | aoc@magiccloud.io | aoc123 | AOC |

3. **You should see the Dashboard** with incidents list

---

## 📂 Project Structure

```
IncidentManagementPortal/
│
├── index.html                 # Main frontend HTML
├── README.md                  # This file
├── SETUP.md                   # Setup instructions
│
├── config/
│   └── config.js             # Frontend configuration
│
├── css/
│   └── styles.css            # Styling
│
├── js/
│   └── app.js                # Frontend JavaScript (10,000+ lines)
│
├── assets/                   # Images and resources
│
└── backend/                  # Backend Node.js/Express
    ├── server.js             # Main server file
    ├── package.json          # Dependencies
    ├── .env                  # Environment variables
    ├── README.md             # Backend documentation
    │
    ├── config/
    │   └── database.js       # MySQL connection
    │
    ├── middleware/
    │   └── auth.js           # JWT authentication
    │
    ├── controllers/
    │   ├── authController.js      # Auth endpoints
    │   └── incidentController.js  # Incident endpoints
    │
    ├── routes/
    │   ├── authRoutes.js     # Auth API routes
    │   └── incidentRoutes.js # Incident API routes
    │
    └── sql/
        └── schema.sql        # Database schema
```

---

## 🚀 Core Features

### 1. Authentication
- Login with email and password
- JWT token-based authentication
- Role-based access control (Admin, Engineer, PMO, CSO, AOC)
- Logout functionality

### 2. Dashboard
- View all incidents
- See incident statistics (total, open, critical)
- Filter by customer, severity, status, area
- Search incidents by title or description

### 3. Incident Management
- **Create** new incidents with all details
- **View** incident details with activity log
- **Update** incident information
- **Close** incidents with resolution details
- **Delete** incidents
- Add **comments** and activity notes

### 4. Filtering & Search
- Filter by customer
- Filter by severity (Critical, High, Medium, Low)
- Filter by status (New, In Progress, Closed, etc.)
- Filter by area (Infra, Application, Historian)
- Filter by tags
- Search by keywords

### 5. Advanced Features
- Activity timeline for each incident
- Tag management
- Downtime and MTTR tracking
- Salesforce case linkage
- RCA (Root Cause Analysis) documentation
- Multiple timezone support

---

## 🔌 API Endpoints

### Authentication
```
POST   /api/auth/login          - User login
GET    /api/auth/users          - Get all users
GET    /api/auth/me             - Get current user
```

### Incidents
```
POST   /api/incidents           - Create incident
GET    /api/incidents           - Get all incidents (with filters)
GET    /api/incidents/:id       - Get single incident
PUT    /api/incidents/:id       - Update incident
DELETE /api/incidents/:id       - Delete incident
POST   /api/incidents/:id/comments - Add comment
GET    /api/incidents/stats/dashboard - Dashboard statistics
```

---

## 🐛 Troubleshooting

### Issue: MySQL Connection Failed

**Error:** `Error: connect ECONNREFUSED 127.0.0.1:3306`

**Solutions:**
1. Ensure MySQL server is running
   ```bash
   # Windows
   net start MySQL80
   
   # Mac
   mysql.server start
   
   # Linux
   sudo systemctl start mysql
   ```

2. Check database credentials in `.env`
3. Verify database exists: `mysql -u root -p -e "SHOW DATABASES;"`

### Issue: Port 3000 Already in Use

**Error:** `Error: listen EADDRINUSE :::3000`

**Solution:**
```bash
# Change PORT in .env to 3001 or 3002
PORT=3001

# Or kill the process using port 3000
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :3000
kill -9 <PID>
```

### Issue: CORS Error in Browser

**Error:** `Access to XMLHttpRequest blocked by CORS policy`

**Solution:**
1. Ensure backend is running on http://localhost:3000
2. Ensure frontend is accessing from http://localhost:8000 or similar
3. Check CORS_ORIGIN in `.env` matches your frontend URL

### Issue: Login Not Working

**Troubleshooting Steps:**
1. Check if backend server is running
2. Verify MySQL database has users table populated
3. Check browser console (F12 → Console) for errors
4. Verify credentials match the users table

---

## 📊 Sample API Usage

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@magiccloud.io","password":"admin123"}'
```

### Create Incident
```bash
curl -X POST http://localhost:3000/api/incidents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Database Error",
    "severity": "Critical",
    "customer": "demo",
    "status": "New"
  }'
```

### Get Incidents
```bash
curl http://localhost:3000/api/incidents \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🔒 Security Notes

### Important for Production

1. **Change JWT Secret:**
   ```
   JWT_SECRET=generate-a-long-random-string-here
   ```

2. **Use Strong Database Password:**
   ```sql
   ALTER USER 'root'@'localhost' IDENTIFIED BY 'StrongPassword123!';
   ```

3. **Change Default User Passwords:**
   ```sql
   UPDATE users SET password='NewSecurePassword' WHERE email='admin@magiccloud.io';
   ```

4. **Enable HTTPS:** Use SSL certificates in production

5. **Add Password Hashing:** Implement bcryptjs for password encryption

---

## 📝 Database Schema

### Users Table
- id, email, password, name, role, initials, created_at

### Incidents Table
- id, title, customer, project, severity, status, engineer, date_created
- description, components, applications, sla_hours, area
- rca, resolution, resolved_by, sf_case, downtime_h, downtime_m, mttr_h, mttr_m

### Incident Comments Table
- id, incident_id, author, action, detail, comment_text, type, created_at

### Incident Tags Table
- id, incident_id, tag_name

---

## 🎓 Learn More

### Recommended Resources
- [Node.js Documentation](https://nodejs.org/en/docs/)
- [Express.js Guide](https://expressjs.com/)
- [MySQL Documentation](https://dev.mysql.com/doc/)
- [JWT.io](https://jwt.io/)

### Backend Documentation
See `backend/README.md` for detailed API documentation and backend setup.

---

## 🤝 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review backend logs in terminal
3. Check browser console (F12 → Console tab)
4. Verify all services are running:
   - MySQL: Running on port 3306
   - Backend: Running on port 3000
   - Frontend: Running on port 8000 or 5500

---

## 📅 Version Info

- **Application Name:** Incident Management Portal
- **Version:** 1.0.0
- **Created:** March 2026
- **Backend:** Node.js + Express
- **Database:** MySQL
- **Frontend:** Vanilla JavaScript + HTML5/CSS3

---

## ✨ Next Steps

1. ✅ Complete the setup above
2. ✅ Create your first incident
3. ✅ Test filtering and search
4. ✅ Customize for your organization
5. ✅ Deploy to production (when ready)

**Enjoy using the Incident Management Portal!** 🚀
