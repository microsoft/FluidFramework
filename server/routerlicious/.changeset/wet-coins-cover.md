---
"@fluidframework/server-services-shared": minor
---

Added support for the creation of health-check endpoints - `/startup`, `/ready` and `/ping`.

The endpoints will be consumed by all HTTP services. These can be used by Kubernetes health probes to monitor container health. It also maintains backward compatability for services like Alfred which already have an existing `/ping` endpoint. It also adds a singleton service to monitor startup status.
