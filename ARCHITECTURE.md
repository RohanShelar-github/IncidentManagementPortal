# System Architecture & Component Diagram

## 🏗️ High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT BROWSER                             │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Frontend Web Application (Vanilla JavaScript)                 │ │
│  │  ┌─────────────────────────────────────────────────────────┐  │ │
│  │  │ • Dashboard (View Incidents & Statistics)              │  │ │
│  │  │ • Login Form (Email/Password)                          │  │ │
│  │  │ • Create Incident Form                                 │  │ │
│  │  │ • Incident Detail View                                 │  │ │
│  │  │ • Filtering & Search                                   │  │ │
│  │  │ • Activity Log                                         │  │ │
│  │  └─────────────────────────────────────────────────────────┘  │ │
│  │                          (HTML/CSS/JS)                         │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │ HTTP/HTTPS
                                  │ JSON (Request/Response)
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        BACKEND SERVER (Node.js/Express)             │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  API Gateway & Routing (Port 3000)                            │ │
│  │  ┌─────────────────────────────────────────────────────────┐  │ │
│  │  │  /api/auth/*          (Authentication Routes)          │  │ │
│  │  │  /api/incidents/*     (Incident Routes)               │  │ │
│  │  └─────────────────────────────────────────────────────────┘  │ │
│  │                                                                 │ │
│  │  ┌──────────────────────┬──────────────────────────────────┐  │ │
│  │  │   MIDDLEWARE         │    CONTROLLERS                   │  │ │
│  │  ├──────────────────────┼──────────────────────────────────┤  │ │
│  │  │ • Auth (JWT)         │ • Auth Controller               │  │ │
│  │  │ • CORS               │   - login()                     │  │ │
│  │  │ • Body Parser        │   - getUsers()                  │  │ │
│  │  │ • Error Handler      │ • Incident Controller           │  │ │
│  │  │                      │   - createIncident()            │  │ │
│  │  │                      │   - getIncidents()              │  │ │
│  │  │                      │   - updateIncident()            │  │ │
│  │  │                      │   - deleteIncident()            │  │ │
│  │  │                      │   - addComment()                │  │ │
│  │  │                      │   - getDashboardStats()         │  │ │
│  │  └──────────────────────┴──────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │ SQL Queries
                                  │ (mysql2/promise)
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DATABASE LAYER (MySQL Server)                    │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  incident_management_db                                        │ │
│  │  ┌──────────┬──────────────┬──────────────┬──────────────┐    │ │
│  │  │ users    │ incidents    │ comments     │ tags         │    │ │
│  │  ├──────────┼──────────────┼──────────────┼──────────────┤    │ │
│  │  │ • email  │ • id         │ • id         │ • id         │    │ │
│  │  │ • pass   │ • title      │ • inc_id     │ • inc_id     │    │ │
│  │  │ • name   │ • customer   │ • author     │ • tag_name   │    │ │
│  │  │ • role   │ • severity   │ • action     │              │    │ │
│  │  │ • init   │ • status     │ • detail     │ (Indexes)    │    │ │
│  │  │          │ • engineer   │ • created_at │              │    │ │
│  │  │ (6 rows) │ • area       │ (Many rows)  │ (Many rows)  │    │ │
│  │  │          │ • tags       │              │              │    │ │
│  │  │          │ (Many rows)  │              │              │    │ │
│  │  └──────────┴──────────────┴──────────────┴──────────────┘    │ │
│  │                                                                 │ │
│  │  • Foreign Keys for Integrity                                 │ │
│  │  • Cascade Deletes                                            │ │
│  │  • Indexes for Performance                                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Flow Diagram

### Login Flow
```
Browser                     Backend                   Database
  │                           │                          │
  ├─ POST /auth/login ───────►│                          │
  │  {email, password}        │                          │
  │                           ├─ Query user ─────────►│
  │                           │ WHERE email=?         │
  │                           │◄─ Return user ─────────│
  │                           │                        │
  │                           ├─ Verify password      │
  │                           │                        │
  │                           ├─ Generate JWT token   │
  │                           │                        │
  │◄─ Return {token, user} ───┤                        │
  │                           │                        │
  └─ Store token in memory    │                        │
     (or localStorage)        │                        │
```

### Create Incident Flow
```
Browser                     Backend                   Database
  │                           │                          │
  ├─ POST /incidents ────────►│                          │
  │  {title, customer,        │                          │
  │   severity, ...}          │                          │
  │  + Bearer token           │                          │
  │                           ├─ Validate token       │
  │                           │                        │
  │                           ├─ Generate ID ────────►│
  │                           │ (INC-XXX)             │
  │                           │◄─ Return new ID ──────│
  │                           │                        │
  │                           ├─ Insert incident ────►│
  │                           │ INSERT INTO incidents │
  │                           │◄─ Success ────────────│
  │                           │                        │
  │                           ├─ Insert tags ────────►│
  │                           │ INSERT INTO tags      │
  │                           │◄─ Success ────────────│
  │                           │                        │
  │                           ├─ Insert activity ────►│
  │                           │ INSERT INTO comments  │
  │                           │◄─ Success ────────────│
  │◄─ Return {id: INC-XXX} ───┤                        │
  │                           │                        │
  └─ Reload incident list     │                        │
```

### Get Incidents with Filters Flow
```
Browser                     Backend                   Database
  │                           │                          │
  ├─ GET /incidents?filter ──►│                          │
  │  ?customer=demo           │                          │
  │  ?severity=Critical       │                          │
  │  + Bearer token           │                          │
  │                           ├─ Validate token       │
  │                           │                        │
  │                           ├─ Build query ────────►│
  │                           │ WHERE customer=?      │
  │                           │ AND severity=?        │
  │                           │ ORDER BY date DESC    │
  │                           │ LIMIT ? OFFSET ?      │
  │                           │◄─ Return incidents ───│
  │                           │                        │
  │                           ├─ For each incident:  │
  │                           │  Fetch tags ─────────►│
  │                           │◄─ Tags returned ──────│
  │                           │                        │
  │◄─ Return [{incidents}] ───┤                        │
  │                           │                        │
  └─ Render table             │                        │
```

### Update Incident Flow
```
Browser                     Backend                   Database
  │                           │                          │
  ├─ PUT /incidents/:id ─────►│                          │
  │  {status: "Closed", ...}  │                          │
  │  + Bearer token           │                          │
  │                           ├─ Validate token       │
  │                           │                        │
  │                           ├─ Check exists ───────►│
  │                           │ SELECT * FROM         │
  │                           │ incidents WHERE id=?  │
  │                           │◄─ Found ───────────────│
  │                           │                        │
  │                           ├─ Update incident ────►│
  │                           │ UPDATE incidents      │
  │                           │ SET status=?, ...     │
  │                           │◄─ Updated ────────────│
  │                           │                        │
  │◄─ Return {success: true} ─┤                        │
  │                           │                        │
  └─ Show success message     │                        │
```

---

## 🔄 Request/Response Cycle

### Typical API Call

```
1. Frontend (Browser)
   └─ Build Request
      ├─ Method: GET/POST/PUT/DELETE
      ├─ URL: http://localhost:3000/api/...
      ├─ Headers: {
      │    Content-Type: application/json
      │    Authorization: Bearer {token}
      │  }
      └─ Body: {JSON data}

2. HTTP Transport (Network)
   └─ Send over internet/local network

3. Backend (Express Server)
   ├─ Receive request
   ├─ Parse JSON body
   ├─ Check CORS
   ├─ Extract authorization header
   ├─ Validate JWT token
   ├─ Route to correct controller
   └─ Execute logic

4. Database (MySQL)
   ├─ Execute SQL query
   ├─ Return result set
   └─ Send back to controller

5. Backend (Express Server)
   ├─ Format response
   ├─ Set status code
   ├─ Stringify JSON
   └─ Send response

6. HTTP Transport (Network)
   └─ Send over internet/local network

7. Frontend (Browser)
   ├─ Receive response
   ├─ Parse JSON
   ├─ Check status code
   ├─ Update UI
   └─ Display to user
```

---

## 🔐 Security Layers

```
Browser                Backend                    Database
   │                      │                         │
   ├─ CORS ◄────────────┤                         │
   │ (Allowed origins)   │                         │
   │                     │                         │
   ├─ HTTPS ◄──────────┤ (In production)          │
   │                     │                         │
   ├─ JWT Token ◄──────┤ Validates token         │
   │ (In Authorization   │ Checks signature        │
   │  header)            │ Verifies expiry         │
   │                     │                         │
   │                     ├─ SQL Injection ◄──────┤
   │                     │ (Prepared statements)   │
   │                     │                         │
   │                     ├─ Connection Pool ◄────┤
   │                     │ (Limited connections)   │
   │                     │                         │
   │                     ├─ Credentials ◄────────┤
   │                     │ (User/Pass stored)      │
   │                     │                         │
   │                     └─ Access Control ◄────┤
   │                       (Role-based)            │
```

---

## 📦 File Organization

```
incident-management-backend/
│
├── server.js
│   └─ Express app setup
│      └─ Routes registration
│         └─ Middleware setup
│
├── config/
│   └─ database.js
│      └─ MySQL pool
│         └─ Connection management
│
├── middleware/
│   └─ auth.js
│      └─ JWT validation
│         └─ Token parsing
│
├── controllers/
│   ├─ authController.js
│   │  ├─ login()
│   │  ├─ getUsers()
│   │  └─ getCurrentUser()
│   │
│   └─ incidentController.js
│      ├─ createIncident()
│      ├─ getIncidents()
│      ├─ getIncidentById()
│      ├─ updateIncident()
│      ├─ deleteIncident()
│      ├─ addComment()
│      └─ getDashboardStats()
│
├── routes/
│   ├─ authRoutes.js
│   │  ├─ POST /auth/login
│   │  ├─ GET  /auth/users
│   │  └─ GET  /auth/me
│   │
│   └─ incidentRoutes.js
│      ├─ POST   /incidents
│      ├─ GET    /incidents
│      ├─ GET    /incidents/:id
│      ├─ PUT    /incidents/:id
│      ├─ DELETE /incidents/:id
│      ├─ POST   /incidents/:id/comments
│      └─ GET    /incidents/stats/dashboard
│
├── sql/
│   └─ schema.sql
│      └─ CREATE TABLE statements
│         └─ DEFAULT data INSERT
│
├── package.json
│   └─ Dependencies
│      └─ npm scripts
│
└── .env
   └─ Configuration
      └─ Secrets
```

---

## 📈 Scalability Considerations

### Current Implementation (Single Server)
```
┌─────────────────────┐
│   Frontend (CDN)    │
└──────────┬──────────┘
           │
    ┌──────▼──────┐
    │  Single     │
    │  Backend    │
    │  Server     │
    │(Port 3000)  │
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │   Single    │
    │   MySQL     │
    │   Database  │
    └─────────────┘
```

### Future Scalability (Multiple Servers)
```
                  ┌─ Backend Server 1
                  │  (Port 3000)
┌────────────────┐│
│   Frontend     ├─── Load Balancer ─── Backend Server 2
│   (CDN)        ││                      (Port 3001)
└────────────────┘│
                  └─ Backend Server N
                     (Port 300N)
                           │
                           │
                  ┌────────▼────────┐
                  │  Database Cluster│
                  │  (MySQL)         │
                  │  (Replication)   │
                  └──────────────────┘
```

---

## 🔌 Integration Points

### Frontend Integration
- Reads API base URL from `config.js`
- Sends JWT token in all requests
- Stores token in memory/localStorage
- Displays data from API responses

### Database Integration
- Uses MySQL2 promise-based API
- Connection pooling
- Prepared statements
- Foreign key relationships

### External Services (Future)
- Email notifications
- SMS alerts
- Slack integration
- Salesforce sync
- JIRA integration

---

## 📊 Performance Metrics

### Database Indexes
- user.email (Unique)
- incidents.customer
- incidents.status
- incidents.severity
- incidents.area
- incidents.date_created
- incident_tags.tag_name
- incident_comments.incident_id

### Connection Pooling
- Max connections: 10
- Queue limit: Unlimited
- Default wait: Enabled

### Response Times (Expected)
- Login: < 500ms
- Get incidents: < 1s (first 50)
- Create incident: < 500ms
- Dashboard stats: < 1s
- Filter incidents: < 1s

---

## 🚀 Deployment Architecture

### Development
```
Developer Machine
├─ Node.js server (localhost:3000)
├─ MySQL server (localhost:3306)
└─ Frontend (localhost:5500)
```

### Production
```
Cloud Provider (AWS/Azure/GCP)
├─ Load Balancer
│  ├─ Backend Instance 1
│  ├─ Backend Instance 2
│  └─ Backend Instance N
├─ Managed MySQL Database
│  ├─ Primary (Read/Write)
│  ├─ Replica 1 (Read)
│  └─ Replica 2 (Read)
├─ CDN for Frontend
├─ SSL/TLS Certificates
├─ Monitoring & Logging
└─ Backups & Recovery
```

---

## 📝 Summary

This architecture provides:
- ✅ Separation of concerns (Frontend/Backend/Database)
- ✅ Scalable REST API
- ✅ Secure JWT authentication
- ✅ Persistent data storage
- ✅ Flexible filtering & querying
- ✅ Activity audit trail
- ✅ Role-based access control
- ✅ Real-time synchronization

All components are loosely coupled and can be independently scaled!
