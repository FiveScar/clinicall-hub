# Clinicall Hub API

Stable RPC interface for scheduling and patient automation.

The Clinicall Hub is a middleware API designed to simplify integrations with healthcare scheduling systems.  
It provides a single RPC endpoint that abstracts internal complexity and exposes a consistent automation surface.

---

## Base Endpoint

```
POST /rpc
```

All operations are executed through this endpoint.

---

## Request Format

```json
{
  "op": "operation.name",
  "data": { ... }
}
```

- `op` → operation identifier
- `data` → operation payload

---

## Example

Confirm a schedule:

```json
{
  "op": "schedule.confirm",
  "data": { "id": 7059 }
}
```

---

## Response Format

Success:

```json
{
  "ok": true,
  "data": { ... }
}
```

Error:

```json
{
  "ok": false,
  "error": "error_code",
  "details": "description"
}
```

---

## Available Operations

### Scheduling

- `schedule.confirm`
- `schedule.cancel`
- `schedule.search`

### Patients

- `patient.search`
- `patient.get`
- `patient.create`
- `patient.update`
- `patient.delete`

### Companies

- `company.list`
- `company.get`

---

## Health Check

```
GET /health
```

Response:

```json
{
  "ok": true,
  "service": "clinicall-hub"
}
```

---

## Route Discovery

```
GET /__routes
```

Returns a list of exposed endpoints.  
Useful for debugging and development.

---

## Request Tracing

Every response includes:

```
X-Request-Id
```

This identifier can be used to trace logs in server diagnostics.

---

## Architecture

```
Automation / Agent
        ↓
   Clinicall Hub (RPC)
        ↓
 External Scheduling System
```

The Hub isolates external dependencies and guarantees interface stability.

---

## Design Goals

- Reduce automation complexity
- Provide a stable RPC surface
- Decouple integrations from vendor APIs
- Centralize scheduling logic
- Enable future evolution without breaking clients

---

## License

Internal integration middleware.  
Not intended as a public SaaS API.
