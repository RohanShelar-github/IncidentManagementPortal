# VM and VPN Network Login Resolution

Date: 29 July 2026

## A. Root Cause Analysis

The application previously required browser clients to reach two separate ports:

- UI: `10.226.24.45:5500`
- API: `10.226.24.45:4000`

This explained why affected users could open the application but intermittently received
`Network error` during login. Reaching port 5500 did not prove that VPN, office firewall,
or split-tunnel policy also allowed direct browser access to port 4000.

The earlier hardcoded `localhost` and CORS issues had already been corrected. The
remaining dual-port browser dependency was unnecessary and network-policy-sensitive.

## B. Network Flow Analysis

Previous flow:

```text
Browser -> 10.226.24.45:5500 (UI)
Browser -> 10.226.24.45:4000 (API)
API -> MySQL
```

Resolved flow:

```text
Browser -> 10.226.24.45:5500 (UI and /api)
UI server -> 127.0.0.1:4000 (internal API proxy)
API -> MySQL
```

Remote clients now require only the same port that successfully loads the application.
API port 4000 no longer needs to be directly reachable by VM or VPN browsers.

## C. Authentication Flow Analysis

1. Browser posts credentials to same-origin `/api/auth/login`.
2. UI server streams the request to the local backend.
3. Backend performs parameterized user lookup in MySQL.
4. Password validation uses bcrypt where hashes exist, with legacy plaintext
   compatibility still present.
5. Backend issues a signed JWT.
6. Browser stores the JWT and supplies it as a Bearer token.
7. `/api/auth/me` verifies and restores the session.

The proxy streams methods, headers, request bodies, response status, headers, and body;
authentication and business APIs remain unchanged.

## D. Session Management Assessment

- Sessions are stateless per-browser JWTs.
- Users and machines have independent tokens.
- One logout does not invalidate another browser.
- A 20-minute client inactivity timeout is active.
- Server JWT expiry defaults to seven days unless `JWT_EXPIRY` is configured.
- There are no session cookies, so cookie Domain, SameSite, Secure, and HttpOnly settings
  are not involved in the observed failure.

## E. Multi-User Assessment

- MySQL is the shared system of record.
- The connection pool supports 10 active connections and queues additional work.
- Comment writes use a transaction and row lock.
- Notifications are stored per user.
- Known concurrency limitations remain: incident numbers use `MAX + 1`, and general
  incident edits are last-write-wins without optimistic version checks.

## F. Files Modified

- `config/config.js`
- `server-ui.js`
- `backend/server.js`
- `tests/cross-machine-access.test.js`
- `tests/same-origin-api-proxy.test.js`

## G. Configuration Changes

Frontend API configuration is now:

```js
API_BASE_URL: "/api"
```

Optional internal proxy settings:

```env
API_PROXY_HOST=127.0.0.1
API_PROXY_PORT=4000
```

When the combined backend starts the UI server, `PORT=4000` is also recognized.

## H. Validation Results

- `GET http://10.226.24.45:5500/api/health`: HTTP 200
- Database health through the UI-port proxy: connected
- Invalid login through port 5500: expected HTTP 401, proving the request reached
  authentication and database lookup
- UI listener: `0.0.0.0:5500`
- Backend listener: `0.0.0.0:4000`
- Automated tests: 75 passed, 0 failed
- Syntax and diff validation: passed

Final real-credential tests from `10.226.24.14` and a VPN laptop require those clients.
They should hard-refresh once before testing so cached API configuration is replaced.

## I. Security Review

The same-origin design removes browser CORS dependence and reduces required firewall
exposure. Remaining production recommendations:

1. Terminate HTTPS before allowing use over untrusted networks.
2. Require a strong environment-provided `JWT_SECRET`.
3. Complete bcrypt migration and remove plaintext password compatibility.
4. Add login throttling and account lockout.
5. Restrict direct inbound access to port 4000 after infrastructure validation, because
   remote browsers now need only port 5500.
6. Add server-side token revocation or short-lived access/refresh tokens.

## J. Rollback Plan

1. Restore the previous hostname-and-port API URL in `config/config.js`.
2. Remove the `/api` proxy block from `server-ui.js`.
3. Restore the previous startup display text in `backend/server.js`.
4. Restart nodemon/backend.

Rollback restores the dual-port browser dependency and is not recommended unless the
same-origin proxy causes an unexpected deployment conflict.
