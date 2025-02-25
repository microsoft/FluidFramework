---
"@fluidframework/server-routerlicious-base": minor
---

Added support for health endpoints for HTTP services.

This adds health endpoints - `/startup`, `/ping` and `/ready` - for Alfred, Riddler and Nexus. Alfred still uses its old ping endpoint - `/api/v1/ping`. It also adds a request listener to the Nexus HTTP server to allow for these endpoints.
