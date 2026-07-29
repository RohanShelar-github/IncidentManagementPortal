# Cross-Machine Login Investigation and Resolution

Date: 29 July 2026

## A. Root Cause Analysis

The UI was reachable from `10.226.24.14`, but its API configuration was hardcoded to
`http://localhost:4000/api`. In a browser on `10.226.24.14`, `localhost` refers to
`10.226.24.14`, not the application host (`10.226.24.45`). The login request therefore
never reached the application backend.

A second issue would have blocked the request after correcting the URL: backend CORS
allowed only `http://localhost:5500`, not `http://10.226.24.45:5500`.

## B. Login Issue Resolution

- The frontend now derives the API hostname from the hostname used to open the UI.
  Opening `http://10.226.24.45:5500` therefore uses
  `http://10.226.24.45:4000/api`.
- Backend CORS now supports an explicit comma-separated origin allowlist.
- Both `http://localhost:5500` and `http://10.226.24.45:5500` are allowed.
- The backend explicitly binds to `0.0.0.0`.
- The backend service was restarted to apply the configuration.

Authentication logic, permissions, incident workflows, and database data were not
changed.

## C. Files Modified

- `config/config.js`
- `backend/server.js`
- `backend/.env`
- `tests/cross-machine-access.test.js`

## D. Configuration Changes

```env
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:5500,http://10.226.24.45:5500
```

Port 4000 is used by the API and port 5500 by the UI.

## E. Session Management Assessment

- Authentication is stateless JWT authentication using a Bearer token.
- Each browser profile stores its own token and therefore has an independent session.
- Logging out in one browser does not invalidate another user's token.
- `/api/auth/me` restores and validates a saved session.
- The client automatically logs out after 20 minutes of inactivity.
- JWT expiry is independently controlled by `JWT_EXPIRY` (currently defaulting to 7 days).

Current security limitations:

- Tokens are stored in `localStorage`, which increases exposure if an XSS flaw exists.
- Tokens cannot be revoked server-side before expiry.
- HTTP is currently used, so credentials and tokens are not transport-encrypted.
- The authentication middleware contains a development fallback JWT secret. Production
  must provide a strong `JWT_SECRET`.
- Login still accepts legacy plaintext database passwords in addition to bcrypt hashes.

## F. Multi-User Readiness Assessment

The architecture supports multiple simultaneous users:

- Requests are authenticated independently using JWTs.
- Role and user identity are taken from each request token.
- Shared application data is stored in MySQL rather than a server-global session.
- The database pool supports up to 10 simultaneous connections and queues additional
  requests.
- InnoDB tables provide transactional and foreign-key behavior.

The application is suitable for controlled internal multi-user use, but the security
and concurrency risks below should be addressed before an internet-facing production
deployment.

## G. Database Concurrency Assessment

Strengths:

- The MySQL driver uses a connection pool.
- Comment append operations use a transaction and `SELECT ... FOR UPDATE`, preventing
  simultaneous comments from overwriting one another.
- `incident_ref` has a unique database constraint.
- InnoDB provides ACID transactions and row locking.

Risks:

- Incident reference generation uses `SELECT MAX(...) + 1`. Simultaneous creates can
  calculate the same reference; the unique constraint prevents corruption but one
  request may fail.
- General incident updates do not use optimistic version checking. Two users editing
  the same incident can overwrite each other's last update.
- A connection limit of 10 is adequate for a small internal team but should be monitored.

## H. Identified Risks

1. HTTP rather than HTTPS.
2. Development fallback JWT secret.
3. Legacy plaintext-password compatibility.
4. No server-side token revocation.
5. Race risk in incident reference generation.
6. Last-write-wins behavior for concurrent incident edits.
7. CORS allowlist must be updated if the UI hostname or port changes.
8. Windows Firewall rules could not be enumerated without elevated system access,
   although both ports are listening and reachable through the host address.

## I. Recommended Improvements

1. Put the UI and API behind HTTPS and a reverse proxy on one origin.
2. Require a strong environment-provided `JWT_SECRET`; remove the fallback secret.
3. Migrate every user password to bcrypt and remove plaintext comparison.
4. Add token revocation or short-lived access tokens with refresh-token rotation.
5. Generate incident references using an atomic database sequence/counter.
6. Add an `updated_at` or version precondition to incident updates and return a conflict
   when another user has changed the record.
7. Add rate limiting and account lockout controls to the login endpoint.
8. Add automated integration tests with two authenticated users.

## J. Validation Results

Validated on the host:

- UI listener: `0.0.0.0:5500`
- API listener: `0.0.0.0:4000`
- `GET /api/health`: HTTP 200 with database connected
- Remote UI Origin header: `Access-Control-Allow-Origin: http://10.226.24.45:5500`
- Login CORS preflight: HTTP 204
- Test login request: reached authentication/database processing and returned the
  expected HTTP 401 for a deliberately nonexistent test account
- Automated regression suite: 58 passed, 0 failed
- JavaScript syntax checks: passed
- Diff validation: passed

Final real-user login from `10.226.24.14` must be confirmed from that VM because this
workspace cannot operate its browser. A hard refresh should be performed first so the
browser loads the updated `config/config.js`.

No write-based concurrent incident test was performed against production data.

## K. Rollback Plan

1. Restore `config/config.js` to the previous fixed API URL.
2. Restore the previous single-origin CORS configuration in `backend/server.js`.
3. Remove `HOST=0.0.0.0` and restore the previous `CORS_ORIGIN` in `backend/.env`.
4. Restart the backend service.

Rollback would also restore the original cross-machine login failure, so it should be
used only if an unexpected deployment issue is discovered.
