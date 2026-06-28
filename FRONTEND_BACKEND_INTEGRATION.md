# 🔗 Frontend-Backend Integration Guide

## Overview

The frontend JavaScript is currently configured to work with local data, but it's designed to be easily switchable to use the backend API. This guide shows you how to enable backend integration.

---

## ✅ Current Status

### What's Already Done
- ✅ Backend API fully implemented
- ✅ Database schema created
- ✅ All endpoints ready
- ✅ Frontend configuration file ready (`config/config.js`)
- ✅ Frontend has API error handling

### What Needs Done
- ⚠️ Update frontend `doLogin()` to call backend API
- ⚠️ Update incident creation to call backend API
- ⚠️ Update incident retrieval to call backend API
- ⚠️ Update incident filtering to call backend API

---

## 🔧 Integration Points

### 1. Login Function (Most Critical)

#### Current Code (Local - in `js/app.js` around line 5500)
```javascript
function doLogin() {
  // ... validation ...
  const userByEmail = USERS_DB.find(u => u.email === email);
  // ... local validation ...
}
```

#### Updated Code (Using Backend API)
```javascript
function doLogin() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  const spinner = document.getElementById('btnSpinner');
  const btnTxt = document.getElementById('btnText');
  
  if (!email || !password) {
    showError('Please enter your email and password.');
    return;
  }

  btn.disabled = true;
  spinner.style.display = 'block';
  btnTxt.textContent = 'Signing in…';

  // Call backend API
  fetch(`${window.APP_CONFIG.API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: email, password: password })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // Save token
      localStorage.setItem(window.APP_CONFIG.JWT_TOKEN_KEY, data.token);
      
      // Update user info
      currentRole = data.user.role;
      currentUserName = data.user.name;
      
      // Continue with login flow
      const loginScreen = document.getElementById('loginScreen');
      loginScreen.classList.add('hidden');
      
      setTimeout(() => {
        loginScreen.style.display = 'none';
        const portal = document.getElementById('portalApp');
        portal.style.display = 'block';
        portal.style.animation = 'cardIn .5s ease';
        
        setHash('home');
        navigateInternal('home', document.getElementById('homeNav'));
        switchRole(data.user.role);
        showToast(`Welcome back, ${data.user.name}! 👋`, 'success');
      }, 450);
    } else {
      showError(data.message || 'Login failed');
      btn.disabled = false;
      spinner.style.display = 'none';
      btnTxt.textContent = 'Sign In to Portal';
    }
  })
  .catch(error => {
    console.error('Login error:', error);
    showError('Network error. Please try again.');
    btn.disabled = false;
    spinner.style.display = 'none';
    btnTxt.textContent = 'Sign In to Portal';
  });
}

function showError(msg) {
  const errEl = document.getElementById('loginError');
  errEl.textContent = '⚠ ' + msg;
  errEl.style.display = 'block';
  errEl.style.animation = 'none';
  requestAnimationFrame(() => { errEl.style.animation = 'shake .3s ease'; });
}
```

---

### 2. Create Incident Function

#### Location
Around line 2000-2500 in `js/app.js` - look for `function saveNewIncident()`

#### Current
```javascript
function saveNewIncident() {
  // ... builds local object ...
  incidents.push(newIncident);
  // ... updates UI ...
}
```

#### Updated
```javascript
function saveNewIncident() {
  const token = localStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) {
    alert('Session expired. Please login again.');
    return;
  }

  // Collect form data
  const data = {
    title: document.getElementById('createTitle').value,
    customer: document.getElementById('createCustomer').value,
    project: document.getElementById('createProject').value,
    severity: document.getElementById('createSeverity').value,
    status: 'New',
    engineer: currentUserName,
    description: document.getElementById('createDesc').value,
    components: document.getElementById('createComponents').value,
    applications: document.getElementById('createApps').value,
    sla_hours: parseInt(document.getElementById('createSLA').value),
    area: document.getElementById('createArea').value,
    tags: (document.getElementById('createTags').value || '').split(',').map(t => t.trim()).filter(t => t)
  };

  // Call backend API
  fetch(`${window.APP_CONFIG.API_BASE_URL}/incidents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      showToast(`${data.data.id} created successfully ✓`, 'success');
      closeCreateIncidentModal();
      loadIncidents(); // Refresh list from backend
    } else {
      showToast(`Error: ${data.message}`, 'error');
    }
  })
  .catch(error => {
    console.error('Create error:', error);
    showToast('Network error. Please try again.', 'error');
  });
}
```

---

### 3. Get Incidents Function

#### Location
Around line 1500-2000 in `js/app.js` - look for where incidents are loaded

#### Updated
```javascript
function loadIncidents() {
  const token = localStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) {
    console.log('No token, staying on login');
    return;
  }

  let url = `${window.APP_CONFIG.API_BASE_URL}/incidents?limit=50&offset=0`;
  
  // Add filters
  const customer = document.getElementById('customerFilter')?.value;
  const severity = document.getElementById('severityFilter')?.value;
  const status = document.getElementById('statusFilter')?.value;
  const area = document.getElementById('areaFilter')?.value;
  
  if (customer) url += `&customer=${encodeURIComponent(customer)}`;
  if (severity) url += `&severity=${encodeURIComponent(severity)}`;
  if (status) url += `&status=${encodeURIComponent(status)}`;
  if (area) url += `&area=${encodeURIComponent(area)}`;

  fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      incidents = data.data;
      filteredIncidents = [...incidents];
      renderIncidentTable();
      updateStatusBar();
    } else {
      console.error('Error loading incidents:', data.message);
    }
  })
  .catch(error => {
    console.error('Load error:', error);
    showToast('Failed to load incidents', 'error');
  });
}
```

---

### 4. Helper Function: Get JWT Token

Add this helper at the top of your modified functions:

```javascript
function getAuthHeader() {
  const token = localStorage.getItem(window.APP_CONFIG.JWT_TOKEN_KEY);
  if (!token) {
    doLogout();
    return null;
  }
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

function apiCall(endpoint, method = 'GET', data = null) {
  const headers = getAuthHeader();
  if (!headers) return Promise.reject('Not authenticated');

  const options = {
    method: method,
    headers: headers
  };

  if (data) options.body = JSON.stringify(data);

  return fetch(`${window.APP_CONFIG.API_BASE_URL}${endpoint}`, options)
    .then(r => r.json());
}
```

---

## 📋 Functions to Update

### Critical (Must Update)
1. **doLogin()** - Enable backend authentication
2. **saveNewIncident()** - Create incidents via API
3. **loadIncidents()** - Load incidents from backend

### Important (Should Update)
4. **updateIncident()** - Update incidents via API
5. **deleteIncident()** - Delete incidents via API
6. **submitComment()** - Add comments via API
7. **openDetailPanel()** - Load incident details from API

### Nice to Have (Optional)
8. **updateStatusBar()** - Get stats from dashboard endpoint
9. **renderDashboard()** - Get dashboard data from API
10. **applyFilters()** - Filter on backend

---

## 🔑 Important Configuration

### Ensure These Are Set Correctly

#### In `config/config.js`
```javascript
window.APP_CONFIG = {
  API_BASE_URL: "http://localhost:3000/api",    // ✓ Correct
  APP_NAME: "Incident Management Portal",
  VERSION: "1.0.0",
  ENABLE_BACKEND: true,
  JWT_TOKEN_KEY: "incident_portal_token"
};
```

#### In `backend/.env`
```
CORS_ORIGIN=http://localhost:5500            # Match your frontend URL!
PORT=3000
```

---

## 🧪 Testing Backend Integration

### Step 1: Verify Backend is Running
```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "OK",
  "message": "Incident Management Backend is running"
}
```

### Step 2: Test Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@magiccloud.io","password":"admin123"}'
```

Expected response:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {...}
}
```

### Step 3: Test Authenticated Request
```bash
curl http://localhost:3000/api/incidents \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected response:
```json
{
  "success": true,
  "data": []
}
```

### Step 4: Test Frontend Login
1. Open frontend in browser
2. Login with `admin@magiccloud.io` / `admin123`
3. Check browser console (F12) for any errors
4. Verify token is saved: `localStorage.getItem('incident_portal_token')`

---

## 🐛 Debugging Tips

### Enable Verbose Logging
Add to frontend functions:
```javascript
console.log('Sending request to:', url);
console.log('Headers:', headers);
console.log('Response:', data);
```

### Check Browser Network Tab
1. Press F12 to open DevTools
2. Go to "Network" tab
3. Perform an action (login, create incident)
4. Click the request
5. Check request/response details

### Check Server Logs
Backend terminal will show:
```
2026-03-15 10:30:45 - POST /api/auth/login
2026-03-15 10:30:46 - GET /api/incidents
```

### Common Issues

**Issue:** "Cannot connect to server"
- [ ] Backend running on :3000?
- [ ] Check API_BASE_URL in config.js
- [ ] Check browser console

**Issue:** "401 Unauthorized"
- [ ] Token not being sent in Authorization header
- [ ] Token expired, need to login again
- [ ] JWT_SECRET mismatch between frontend and backend

**Issue:** "CORS Error"
- [ ] Check CORS_ORIGIN in backend/.env
- [ ] Must match your frontend URL exactly
- [ ] Restart backend after changing

**Issue:** "404 Not Found"
- [ ] Wrong endpoint URL
- [ ] Typo in route path
- [ ] Backend not recognizing route

---

## 📊 Migration Checklist

### Before Going Live
- [ ] Backend running successfully
- [ ] Database populated with users
- [ ] Login working with backend
- [ ] Create incident working
- [ ] Incidents displaying from database
- [ ] Filters working
- [ ] Comments working
- [ ] Update/Delete working
- [ ] All tests passing

### Testing Each Feature
- [ ] **Auth**: Login succeeds with valid credentials
- [ ] **Auth**: Login fails with invalid credentials
- [ ] **Create**: New incident saved to database
- [ ] **Read**: Incidents displayed from database
- [ ] **Filter**: Filtering works correctly
- [ ] **Update**: Incident changes saved
- [ ] **Delete**: Incident removed from database
- [ ] **Comment**: Comments persist in database

---

## 🚀 Deployment Checklist

### Before Production
- [ ] Update JWT_SECRET to random strong key
- [ ] Change CORS_ORIGIN to production domain
- [ ] Update API_BASE_URL to production URL
- [ ] Change all default passwords
- [ ] Enable HTTPS/SSL
- [ ] Setup database backups
- [ ] Enable monitoring/logging
- [ ] Test all endpoints in production environment

---

## 📝 Quick Reference

### API Endpoints to Implement

```javascript
// Authentication
POST   /auth/login
GET    /auth/me
GET    /auth/users

// Incidents
POST   /incidents              // Create
GET    /incidents              // List with filters
GET    /incidents/:id          // Get one
PUT    /incidents/:id          // Update
DELETE /incidents/:id          // Delete
POST   /incidents/:id/comments // Add comment

// Dashboard
GET    /incidents/stats/dashboard
```

### Frontend Functions to Modify

```javascript
doLogin()              // ← START HERE (Critical)
saveNewIncident()      // ← Then this
loadIncidents()        // ← Then this
updateIncident()
deleteIncident()
submitComment()
openDetailPanel()
getDashboardStats()
```

---

## 🎯 Integration Strategy

### Phase 1: Authentication (Day 1)
1. Update `doLogin()` to use backend API
2. Test login works
3. Verify token storage

### Phase 2: CRUD Operations (Day 2)
1. Update `saveNewIncident()` to use API
2. Update `loadIncidents()` to use API
3. Update `updateIncident()` to use API
4. Update `deleteIncident()` to use API

### Phase 3: Advanced Features (Day 3)
1. Update `submitComment()` to use API
2. Update dashboard stats to use API
3. Implement proper error handling
4. Full testing

### Phase 4: Production (Day 4)
1. Security hardening
2. Performance optimization
3. Monitoring setup
4. Deployment

---

## ✅ Success Criteria

You'll know the integration is successful when:
- ✅ Login works with backend authentication
- ✅ Creating an incident persists to database
- ✅ Refreshing the page shows the incident from database
- ✅ Filters work with backend queries
- ✅ All user actions are logged in database
- ✅ No console errors
- ✅ Application is fully functional

---

## 📞 Need Help?

1. Check [`API_TESTING.md`](API_TESTING.md) for endpoint details
2. Review [`backend/README.md`](backend/README.md) for backend info
3. Check browser console (F12) for errors
4. Check backend server logs
5. Verify MySQL has data: `mysql -u root -p incident_management_db -e "SELECT * FROM users;"`

---

## 🎓 Learning Resources

- [Fetch API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [REST API Best Practices](https://restfulapi.net/)
- [HTTP Status Codes](https://httpwg.org/specs/rfc7231.html#status.codes)
- [JWT Authentication](https://jwt.io/introduction)

---

**Ready to integrate?** Start with Step 1 above! 🚀

*Last Updated: March 2026*
*Status: ✅ Ready for Implementation*
