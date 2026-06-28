# API Testing Guide - Postman Collection

Use this guide to test all backend API endpoints. You can use curl, Postman, or any HTTP client.

---

## 📌 Base URL
```
http://localhost:3000/api
```

---

## 1. Authentication Endpoints

### 1.1 Login
**Purpose:** Get JWT token for API access

```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@magiccloud.io",
  "password": "admin123"
}
```

**Success Response (200):**
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

**Save the token for other requests!**

---

### 1.2 Get Current User
**Purpose:** Fetch logged-in user details

```http
GET /auth/me
Authorization: Bearer {your_token_here}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "admin@magiccloud.io",
    "name": "Admin User",
    "role": "admin",
    "initials": "A"
  }
}
```

---

### 1.3 Get All Users
**Purpose:** Fetch list of all system users

```http
GET /auth/users
Authorization: Bearer {your_token_here}
```

**Success Response (200):**
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
    },
    {
      "id": 2,
      "email": "babai_chatterjee@magicsoftware.com",
      "name": "Babai Chatterjee",
      "role": "admin",
      "initials": "BC"
    }
  ]
}
```

---

## 2. Incident Endpoints

### 2.1 Create Incident
**Purpose:** Create a new incident

```http
POST /incidents
Authorization: Bearer {your_token_here}
Content-Type: application/json

{
  "title": "Database connection timeout",
  "customer": "demo",
  "project": "Cloud Infrastructure",
  "severity": "Critical",
  "status": "New",
  "engineer": "Babai Chatterjee",
  "description": "Production DB connections spiking to 1500+",
  "components": "Database Cluster, Connection Pool",
  "applications": "Customer Portal, Admin Panel",
  "sla_hours": 1,
  "area": "Infra",
  "tags": ["database", "timeout", "critical"]
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Incident created successfully",
  "data": {
    "id": "INC-001"
  }
}
```

---

### 2.2 Get All Incidents
**Purpose:** Fetch incidents with optional filters

```http
GET /incidents?limit=10&offset=0
Authorization: Bearer {your_token_here}
```

**With Filters:**
```http
GET /incidents?customer=demo&severity=Critical&status=New&area=Infra&limit=10
Authorization: Bearer {your_token_here}
```

**Query Parameters:**
- `customer` - Filter by customer name
- `area` - Filter by area (Infra, Application, Historian)
- `severity` - Filter by severity (Critical, High, Medium, Low)
- `status` - Filter by status
- `tags` - Filter by tags (comma-separated)
- `search` - Search in title and description
- `limit` - Number of results (default: 50)
- `offset` - Pagination offset (default: 0)

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "INC-001",
      "title": "Database connection timeout",
      "customer": "demo",
      "project": "Cloud Infrastructure",
      "severity": "Critical",
      "status": "New",
      "engineer": "Babai Chatterjee",
      "date_created": "2026-03-01T10:30:00.000Z",
      "description": "Production DB connections spiking to 1500+",
      "components": "Database Cluster, Connection Pool",
      "applications": "Customer Portal, Admin Panel",
      "sla_hours": 1,
      "area": "Infra",
      "tags": ["database", "timeout", "critical"]
    }
  ]
}
```

---

### 2.3 Get Single Incident
**Purpose:** Fetch details of a specific incident

```http
GET /incidents/INC-001
Authorization: Bearer {your_token_here}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "INC-001",
    "title": "Database connection timeout",
    "customer": "demo",
    "project": "Cloud Infrastructure",
    "severity": "Critical",
    "status": "New",
    "engineer": "Babai Chatterjee",
    "date_created": "2026-03-01T10:30:00.000Z",
    "description": "Production DB connections spiking to 1500+",
    "components": "Database Cluster, Connection Pool",
    "applications": "Customer Portal, Admin Panel",
    "sla_hours": 1,
    "area": "Infra",
    "rca": null,
    "resolution": null,
    "resolved_by": null,
    "sf_case": null,
    "downtime_h": 0,
    "downtime_m": 0,
    "mttr_h": 0,
    "mttr_m": 0,
    "tags": ["database", "timeout", "critical"],
    "comments": [
      {
        "id": 1,
        "incident_id": "INC-001",
        "author": "Babai Chatterjee",
        "action": "created incident",
        "detail": "Severity: Critical · Customer: demo",
        "comment_text": null,
        "type": "create",
        "user_id": 2,
        "created_at": "2026-03-01T10:30:00.000Z"
      }
    ]
  }
}
```

---

### 2.4 Update Incident
**Purpose:** Update an existing incident

```http
PUT /incidents/INC-001
Authorization: Bearer {your_token_here}
Content-Type: application/json

{
  "status": "In Progress",
  "engineer": "Rohan Shelar",
  "severity": "High"
}
```

**You can update any fields:**
```json
{
  "title": "Updated Title",
  "status": "Closed",
  "engineer": "New Engineer",
  "severity": "Medium",
  "rca": "Root cause was X",
  "resolution": "Applied fix Y",
  "resolved_by": "Admin User",
  "downtime_h": 2,
  "downtime_m": 30,
  "mttr_h": 1,
  "mttr_m": 45,
  "tags": ["database", "fixed"]
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Incident updated successfully"
}
```

---

### 2.5 Delete Incident
**Purpose:** Delete an incident

```http
DELETE /incidents/INC-001
Authorization: Bearer {your_token_here}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Incident deleted successfully"
}
```

---

### 2.6 Get Dashboard Statistics
**Purpose:** Get incident statistics for dashboard

```http
GET /incidents/stats/dashboard
Authorization: Bearer {your_token_here}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "total": 20,
    "open": 15,
    "critical": 3,
    "statusBreakdown": [
      {
        "status": "New",
        "count": 5
      },
      {
        "status": "In Progress",
        "count": 8
      },
      {
        "status": "Closed",
        "count": 7
      }
    ],
    "severityBreakdown": [
      {
        "severity": "Critical",
        "count": 3
      },
      {
        "severity": "High",
        "count": 8
      },
      {
        "severity": "Medium",
        "count": 6
      },
      {
        "severity": "Low",
        "count": 3
      }
    ],
    "areaBreakdown": [
      {
        "area": "Infra",
        "count": 12
      },
      {
        "area": "Application",
        "count": 5
      },
      {
        "area": "Historian",
        "count": 3
      }
    ]
  }
}
```

---

### 2.7 Add Comment to Incident
**Purpose:** Add a comment or activity note to an incident

```http
POST /incidents/INC-001/comments
Authorization: Bearer {your_token_here}
Content-Type: application/json

{
  "comment_text": "Investigating the root cause",
  "action": "commented",
  "detail": "Found connection pool issue at line 245"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Comment added successfully"
}
```

---

## 🧪 CURL Examples

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@magiccloud.io","password":"admin123"}'
```

### Get All Incidents
```bash
curl -X GET "http://localhost:3000/api/incidents?limit=10&offset=0" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Create Incident
```bash
curl -X POST http://localhost:3000/api/incidents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Incident",
    "customer": "demo",
    "severity": "High",
    "status": "New",
    "tags": ["test"]
  }'
```

### Update Incident
```bash
curl -X PUT http://localhost:3000/api/incidents/INC-001 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"In Progress","engineer":"Rohan Shelar"}'
```

### Add Comment
```bash
curl -X POST http://localhost:3000/api/incidents/INC-001/comments \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"comment_text":"This is a test comment"}'
```

---

## 🔍 Testing Filters

### Filter by Customer
```
GET /incidents?customer=demo
```

### Filter by Severity
```
GET /incidents?severity=Critical
```

### Filter by Status
```
GET /incidents?status=In+Progress
```

### Filter by Area
```
GET /incidents?area=Infra
```

### Multiple Filters
```
GET /incidents?customer=demo&severity=Critical&status=New
```

### Search
```
GET /incidents?search=database
```

### Pagination
```
GET /incidents?limit=10&offset=20
```

---

## 📊 Response Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Server Error |

---

## 🔑 Default Users for Testing

```
Email: admin@magiccloud.io
Password: admin123

Email: babai_chatterjee@magicsoftware.com
Password: babai123

Email: rohan_shelar@magicsoftware.com
Password: rohan123

Email: cso@magiccloud.io
Password: cso123

Email: aoc@magiccloud.io
Password: aoc123
```

---

## 💡 Tips

1. **Always save the token** from login response
2. **Include Authorization header** in all requests
3. **Use proper Content-Type** for JSON requests
4. **Check response status codes** to understand errors
5. **Test pagination** with different limit and offset values
6. **Try different filters** to understand query capabilities

---

**Happy Testing!** 🚀
