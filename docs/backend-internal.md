# Clinicall Hub — Internal Technical Documentation

## Overview

Clinicall Hub is an Express middleware layer that proxies and normalizes access to the Clinicall backend API.

It implements:

- authentication handling
- retry + fetch wrapper
- domain routing
- RPC dispatcher
- request tracing
- error normalization

---

## Stack

- Node 22
- Express
- ESM modules
- Coolify deployment
- External Clinicall API

---

## Core Architecture

```
n8n / Agents
     ↓
RPC Dispatcher (/rpc)
     ↓
Domain Routers
     ↓
clinicall.client.js
     ↓
Clinicall Backend
```

---

## Key Modules

### clinicall/client.js

Responsibilities:

- authentication
- token caching
- header injection
- retry logic
- fetch wrapper
- error normalization

All external calls must go through:

```
clinicall.request(path, { method, body })
```

No direct fetch allowed.

---

### RPC Router

File:

```
routes/rpc.routes.js
```

Maps logical operations to domain routes.

Example:

```
schedule.confirm → /schedules/:id/confirm
```

RPC ensures:

- single entry point for automations
- stable interface
- future versioning support

---

### Domain Routers

#### schedules.routes.js

- search
- confirm
- cancel
- status passthrough

Confirm/cancel implemented via:

```
POST /partners/:id/patientStatus/{code}
```

Codes:

```
C = confirmed
B = canceled
```

---

#### patients.routes.js

- CRUD
- search
- birthday endpoint with fallback handling
- clinicall 500 normalization

Birthday endpoint known instability:
returns 502 clean error when Clinicall fails.

---

### __routes Router

Development-only route inspector:

```
GET /__routes
```

Dynamically lists mounted Express routes.

Used for diagnostics.

---

## Error Strategy

Clinicall errors are normalized:

- 404 passthrough
- 500 converted to clean error payload
- SYSTEM_EXCEPTION mapped to safe response

Hub must never leak raw upstream errors.

---

## Logging

Each request:

- generates UUID
- attaches `X-Request-Id`
- logs method + URL + status + duration

No body logging (privacy-safe).

---

## Security Notes

- Hub hides Clinicall tenant details
- No direct exposure of upstream endpoints
- RPC layer prevents arbitrary proxying
- Only whitelisted operations allowed

---

## Performance

Hub is stateless.

Scaling strategy:

- horizontal replicas
- shared environment auth
- no persistent storage

---

## Future Extensions

- /rpc/v1 versioning
- schema validation per op
- rate limiting
- audit logging
- caching layer
- metrics export

---

## Deployment

Environment variables required:

```
CLINICALL_BASE_URL
CLINICALL_TENANTID
CLINICALL_LOGIN
CLINICALL_PASSWORD
```

---

## Known Vendor Issues

- birthday endpoint unstable (SYSTEM_EXCEPTION)
- inconsistent confirm/cancel endpoints
- status must be updated via patientStatus fallback

Hub contains mitigation logic.

---

## Maintenance Rule

Never expose raw Clinicall endpoints to clients.

All integrations must go through RPC.
