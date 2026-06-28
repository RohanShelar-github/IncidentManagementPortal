# 🚀 Quick Start Guide - 5 Minutes to Get Running

## Prerequisites
- ✅ Node.js installed
- ✅ MySQL installed and running
- ✅ This repository cloned

---

## ⚡ Super Quick Setup (Copy & Paste)

### 1. Open Command Prompt/Terminal in project folder

```bash
cd d:\CSO\IncidentManagementPortal
```

### 2. Setup Database (One command)

```bash
mysql -u root -p incident_management_db < backend\sql\schema.sql
```
*Enter your MySQL password*

### 3. Install & Start Backend

```bash
cd backend
npm install
npm run dev
```

*Keep this terminal open!*

### 4. Open Frontend

In **VS Code**:
- Right-click `index.html`
- Select "Open with Live Server"

Or manually open in browser:
```
http://localhost:5500
```

---

## 🔐 Login

**Use any of these credentials:**

```
Email: admin@magiccloud.io
Password: admin123
```

Or:
```
Email: babai_chatterjee@magicsoftware.com
Password: babai123
```

---

## 🎯 Test Features

### 1. Create an Incident
- Click "Incidents" → "Create New"
- Fill in the form
- Click "Create Incident"

### 2. View Dashboard
- Click "Dashboard"
- See statistics and incident list

### 3. Filter Incidents
- Select customer, area, severity
- Click "Apply Filters"

### 4. Update Incident
- Click any incident
- Click "Edit"
- Modify and save

---

## 📊 Load Sample Data (Optional)

To add 5 sample incidents for testing:

```bash
cd backend
npm run load-data
```

---

## 🆘 Troubleshooting

### Backend won't start
```bash
# Check if port 3000 is in use
netstat -ano | findstr :3000

# If in use, change PORT in .env to 3001
```

### MySQL connection fails
```bash
# Verify MySQL is running
mysql -u root -p -e "SELECT 1"

# Check credentials in backend/.env
```

### Frontend shows "Cannot connect to server"
1. Ensure backend is running (see step 3 above)
2. Check browser console (F12 → Console)
3. Verify http://localhost:3000/api/health returns OK

---

## 📁 Project Structure (Quick Reference)

```
backend/
├── server.js           ← Main server
├── .env               ← Database config
├── package.json       ← Dependencies
├── controllers/       ← Business logic
├── routes/           ← API endpoints
└── sql/schema.sql    ← Database schema

frontend/
├── index.html        ← Main page
├── js/app.js         ← JavaScript
└── config/config.js  ← API config
```

---

## 🔗 Useful URLs

- **Frontend**: http://localhost:5500 (or your Live Server URL)
- **Backend API**: http://localhost:3000/api
- **Health Check**: http://localhost:3000/api/health
- **Database**: mysql://root@localhost:3306/incident_management_db

---

## 📝 API Examples

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@magiccloud.io\",\"password\":\"admin123\"}"
```

### Create Incident
```bash
curl -X POST http://localhost:3000/api/incidents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Test Incident\",\"severity\":\"High\",\"customer\":\"demo\",\"status\":\"New\"}"
```

---

## 🎓 Next Steps

1. ✅ Follow the steps above
2. 📖 Read full documentation in `SETUP_COMPLETE.md`
3. 🔍 Explore the API in `backend/README.md`
4. 🛠️ Customize for your needs
5. 🚀 Deploy to production

---

**Need help?** Check `SETUP_COMPLETE.md` for detailed troubleshooting!

Happy incident tracking! 🎉
